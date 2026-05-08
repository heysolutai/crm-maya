/**
 * Adapter para UazAPI.
 *
 * Auth do UazAPI:
 * - O servidor tem um ADMIN_TOKEN global que cria/deleta instancias.
 *   Header: `admintoken: <ADMIN_TOKEN>` (somente em /instance/init e DELETE /instance).
 * - Cada instancia tem seu proprio `token` retornado por /instance/init.
 *   Header: `token: <instanceToken>` em todas as outras chamadas.
 *
 * Estrategia:
 * - `provision`: usa admintoken pra criar a instancia, recebe e grava o token
 *   especifico da instancia em instanceApiKey. O admintoken global e gravado
 *   em channel_config.serverApiKey pra permitir delete depois.
 * - Subsequentes (connect/status/send/disconnect): usa o token da instancia.
 * - `remove`: tenta com o token da instancia, com fallback pro admintoken.
 */

import type {
  ChannelAdapter,
  ChannelAgent,
  ProvisionInput,
  ProvisionResult,
  QrResult,
  StatusResult,
  SendTextInput,
  SendTextResult,
} from '../adapter';
import { ChannelError, classifyHttpStatus, isNetworkError } from '../errors';

interface UazapiChannelConfig {
  serverApiKey?: string; // admintoken
  webhookUrl?: string;
}

function getInstanceToken(agent: ChannelAgent): string {
  return agent.instanceApiKey || '';
}

function getAdminToken(agent: ChannelAgent): string {
  const config = (agent.channelConfig as UazapiChannelConfig | null) || {};
  return config.serverApiKey || '';
}

function trimUrl(u: string): string {
  return u.replace(/\/+$/, '');
}

/** UazAPI usa headers diferentes pra admin vs instancia — abstraido aqui. */
async function uazapiFetch(
  baseUrl: string,
  authMode: 'admin' | 'instance',
  token: string,
  method: string,
  path: string,
  body?: unknown,
  opts?: { timeoutMs?: number }
): Promise<{ ok: boolean; status: number; data: any }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 15000);

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (authMode === 'admin') headers.admintoken = token;
  else headers.token = token;

  let res: Response;
  try {
    res = await fetch(`${trimUrl(baseUrl)}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as any)?.name === 'AbortError') {
      throw new ChannelError(
        'Servidor UazAPI nao respondeu a tempo (timeout)',
        'PROVIDER_UNREACHABLE',
        { httpStatus: 504 }
      );
    }
    if (isNetworkError(err)) {
      throw new ChannelError(
        'Nao foi possivel conectar ao servidor UazAPI. Verifique a URL e se ele esta online.',
        'NETWORK_ERROR'
      );
    }
    throw new ChannelError((err as Error).message || 'Erro de rede', 'UNKNOWN');
  } finally {
    clearTimeout(timeout);
  }

  let data: any = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  return { ok: res.ok, status: res.status, data };
}

function extractError(data: any, fallback: string): string {
  if (!data) return fallback;
  if (typeof data === 'string') return data;
  if (typeof data.error === 'string') return data.error;
  if (typeof data.message === 'string') return data.message;
  if (Array.isArray(data?.errors) && data.errors.length) return data.errors.map((e: any) => e.message || e).join('; ');
  return fallback;
}

function throwForStatus(
  status: number,
  data: any,
  fallback: string,
  hint?: { conflictMatcher?: (msg: string) => boolean }
): never {
  const message = extractError(data, fallback);
  let code = classifyHttpStatus(status);
  if (code === 'BAD_REQUEST' && hint?.conflictMatcher && hint.conflictMatcher(message)) {
    code = 'CONFLICT';
  }
  throw new ChannelError(message, code, { providerStatus: status, providerBody: data });
}

/** UazAPI retorna estado em status.connected / status.loggedIn / instance.status */
function mapState(raw: any): StatusResult['status'] {
  const isLoggedIn = raw?.status?.loggedIn === true;
  const isConnected = raw?.status?.connected === true;
  if (isLoggedIn) return 'connected';
  if (isConnected) return 'connecting';

  const apiStatus = raw?.instance?.status || raw?.status;
  if (typeof apiStatus === 'string') {
    if (apiStatus === 'connected' || apiStatus === 'open') return 'connected';
    if (apiStatus === 'connecting' || apiStatus === 'qrcode') return 'connecting';
    if (apiStatus === 'disconnected' || apiStatus === 'closed' || apiStatus === 'logout') return 'disconnected';
  }
  return 'disconnected';
}

function extractPhone(raw: any): string | null {
  for (const source of [
    raw?.instance?.phone,
    raw?.instance?.me,
    raw?.instance?.owner,
    raw?.status?.jid,
    raw?.phone,
  ]) {
    if (source && typeof source === 'string') {
      const phone = String(source).replace(/@.*$/, '').replace(/\D/g, '');
      if (phone.length >= 10) return phone;
    }
  }
  return null;
}

function normalizeQr(code: string | null | undefined): string | null {
  if (!code) return null;
  if (code.startsWith('data:image')) return code;
  if (code.startsWith('http')) return code;
  return `data:image/png;base64,${code}`;
}

export const uazapiAdapter: ChannelAdapter = {
  type: 'uazapi',

  async provision(input: ProvisionInput): Promise<ProvisionResult> {
    if (!input.serverUrl) {
      throw new ChannelError('URL do servidor UazAPI e obrigatoria', 'BAD_REQUEST');
    }
    if (!input.serverApiKey) {
      throw new ChannelError('Admin Token do servidor UazAPI e obrigatorio', 'BAD_REQUEST');
    }

    const slug = input.displayName
      .normalize('NFD')
      .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase()
      .slice(0, 24) || 'agent';
    const instanceName = `${slug}-${input.companyId.slice(0, 8)}-${Date.now().toString(36).slice(-4)}`;

    // 1) Cria a instancia com admin token
    const initRes = await uazapiFetch(
      input.serverUrl,
      'admin',
      input.serverApiKey,
      'POST',
      '/instance/init',
      {
        name: instanceName,
        systemName: 'apilocal',
        adminField01: input.displayName,
        adminField02: input.companyId,
      }
    );

    if (!initRes.ok) {
      throwForStatus(initRes.status, initRes.data, `Falha ao criar instancia (${initRes.status})`, {
        conflictMatcher: (msg) => /already.*(use|exist)|name.*exist/i.test(msg),
      });
    }

    // O token da instancia pode vir em `token` ou `instance.token`
    const instanceToken: string | null =
      initRes.data?.token || initRes.data?.instance?.token || null;
    if (!instanceToken) {
      throw new ChannelError(
        'UazAPI nao retornou token da instancia',
        'UNKNOWN',
        { providerBody: initRes.data }
      );
    }

    const apiUrl = trimUrl(input.serverUrl);

    // 2) Configura webhook pra apontar pro nosso receiver
    //    Erros silenciados — algumas versoes do UazAPI nao tem esse endpoint;
    //    o usuario pode configurar manualmente no painel se preciso.
    try {
      await uazapiFetch(apiUrl, 'instance', instanceToken, 'POST', '/webhook', {
        action: 'add',
        enabled: true,
        url: input.webhookUrl,
        events: ['messages', 'messages_update'],
        excludeMessages: ['isGroupYes'],
      });
    } catch (e) {
      console.warn('[uazapi] webhook setup falhou (ignorado):', (e as Error).message);
    }

    // 3) Pede QR Code (instance/connect com phone vazio)
    let qrCode: string | null = null;
    try {
      const connRes = await uazapiFetch(apiUrl, 'instance', instanceToken, 'POST', '/instance/connect', {
        phone: '',
      });
      if (connRes.ok) {
        qrCode = connRes.data?.instance?.qrcode || connRes.data?.qrcode || null;
      }
    } catch (e) {
      console.warn('[uazapi] connect inicial falhou (ignorado):', (e as Error).message);
    }

    return {
      providerInstanceName: instanceName,
      instanceApiKey: instanceToken,
      apiUrl,
      channelConfig: {
        serverApiKey: input.serverApiKey,
        webhookUrl: input.webhookUrl,
      },
      metadata: initRes.data,
      qrCode: normalizeQr(qrCode),
      pairingCode: null,
    };
  },

  async getQrCode(agent: ChannelAgent): Promise<QrResult> {
    if (!agent.apiUrl) throw new ChannelError('Servidor nao configurado', 'BAD_REQUEST');
    const token = getInstanceToken(agent);
    if (!token) throw new ChannelError('Token da instancia nao configurado', 'BAD_REQUEST');

    const res = await uazapiFetch(agent.apiUrl, 'instance', token, 'POST', '/instance/connect', {
      phone: '',
    });

    if (!res.ok) {
      throwForStatus(res.status, res.data, `Falha ao gerar QR (${res.status})`);
    }

    const code = res.data?.instance?.qrcode || res.data?.qrcode || null;
    const isLoggedIn = res.data?.loggedIn === true || res.data?.status?.loggedIn === true;

    return {
      qrCode: normalizeQr(code),
      pairingCode: null,
      status: isLoggedIn ? 'connected' : code ? 'connecting' : 'disconnected',
    };
  },

  async getStatus(agent: ChannelAgent): Promise<StatusResult> {
    if (!agent.apiUrl) throw new ChannelError('Servidor nao configurado', 'BAD_REQUEST');
    const token = getInstanceToken(agent);
    if (!token) throw new ChannelError('Token da instancia nao configurado', 'BAD_REQUEST');

    const res = await uazapiFetch(agent.apiUrl, 'instance', token, 'GET', '/instance/status');

    if (!res.ok) {
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        throwForStatus(res.status, res.data, `Falha ao consultar status (${res.status})`);
      }
      return { status: 'error', raw: res.data };
    }

    const phone = extractPhone(res.data);
    return {
      status: mapState(res.data),
      phoneNumber: phone,
      raw: res.data,
    };
  },

  async disconnect(agent: ChannelAgent): Promise<void> {
    if (!agent.apiUrl) return;
    const token = getInstanceToken(agent);
    if (!token) return;

    try {
      await uazapiFetch(agent.apiUrl, 'instance', token, 'DELETE', '/instance/logout');
    } catch (e) {
      console.warn(`[uazapi] disconnect error (ignored):`, (e as Error).message);
    }
  },

  async remove(agent: ChannelAgent): Promise<void> {
    if (!agent.apiUrl) return;

    // Tenta com token da instancia primeiro; cai pro admin se falhar
    const instanceToken = getInstanceToken(agent);
    const adminToken = getAdminToken(agent);

    try {
      if (instanceToken) {
        await uazapiFetch(agent.apiUrl, 'instance', instanceToken, 'DELETE', '/instance');
        return;
      }
    } catch (e) {
      console.warn(`[uazapi] remove with instance token failed:`, (e as Error).message);
    }

    if (adminToken) {
      try {
        await uazapiFetch(agent.apiUrl, 'admin', adminToken, 'DELETE', `/instance/${encodeURIComponent(agent.instanceName)}`);
      } catch (e) {
        console.warn(`[uazapi] remove with admin token failed:`, (e as Error).message);
      }
    }
  },

  async sendText(agent: ChannelAgent, input: SendTextInput): Promise<SendTextResult> {
    if (!agent.apiUrl) throw new ChannelError('Servidor nao configurado', 'BAD_REQUEST');
    const token = getInstanceToken(agent);
    if (!token) throw new ChannelError('Token da instancia nao configurado', 'BAD_REQUEST');

    const body: Record<string, unknown> = {
      number: input.to.replace(/\D/g, ''),
      text: input.text,
    };
    if (input.quotedMessageId) body.replyid = input.quotedMessageId;

    const res = await uazapiFetch(agent.apiUrl, 'instance', token, 'POST', '/send/text', body);

    if (!res.ok) {
      throwForStatus(res.status, res.data, `Falha ao enviar mensagem (${res.status})`);
    }

    // UazAPI retorna `id` ou `message_id` ou `key.id`
    const rawMessageId = res.data?.message_id || res.data?.id || res.data?.key?.id || '';
    const messageId =
      typeof rawMessageId === 'string' && rawMessageId.includes(':')
        ? rawMessageId.split(':').pop() || rawMessageId
        : rawMessageId;

    return {
      providerMessageId: String(messageId),
      status: 'sent',
      raw: res.data,
    };
  },
};

/**
 * Adapter para Evolution API v2 (integracao WHATSAPP-BAILEYS).
 *
 * Doc: https://doc.evolution-api.com/v2/api-reference/
 *
 * Auth do Evolution:
 * - Cada servidor Evolution tem um AUTHENTICATION_API_KEY global (admin).
 * - Apos criar uma instancia, o servidor retorna `hash.apikey` — uma key
 *   especifica pra aquela instancia. Nas chamadas subsequentes (connect,
 *   sendText, etc), aceita tanto a global quanto a per-instance.
 *
 * Estrategia neste adapter:
 * - `provision`: usa a key GLOBAL passada no input (serverApiKey).
 * - Subsequentes: usa a per-instance key (gravada em instanceApiKey).
 * - A key global do server e gravada em channel_config.serverApiKey
 *   pra permitir delete/relogout depois.
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

interface EvolutionChannelConfig {
  serverApiKey?: string;
  webhookUrl?: string;
}

function getServerKey(agent: ChannelAgent): string {
  const config = (agent.channelConfig as EvolutionChannelConfig | null) || {};
  // Per-instance key e a primaria; cai pra global se nao houver
  return agent.instanceApiKey || config.serverApiKey || '';
}

function trimUrl(u: string): string {
  return u.replace(/\/+$/, '');
}

async function evolutionFetch(
  baseUrl: string,
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
  opts?: { timeoutMs?: number }
): Promise<{ ok: boolean; status: number; data: any }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 15000);

  let res: Response;
  try {
    res = await fetch(`${trimUrl(baseUrl)}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as any)?.name === 'AbortError') {
      throw new ChannelError(
        'Servidor Evolution nao respondeu a tempo (timeout)',
        'PROVIDER_UNREACHABLE',
        { httpStatus: 504 }
      );
    }
    if (isNetworkError(err)) {
      throw new ChannelError(
        'Nao foi possivel conectar ao servidor Evolution. Verifique a URL e se ele esta online.',
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
  if (typeof data.message === 'string') return data.message;
  if (Array.isArray(data?.response?.message)) return data.response.message.join('; ');
  if (typeof data?.response?.message === 'string') return data.response.message;
  if (typeof data.error === 'string') return data.error;
  return fallback;
}

/**
 * Helper que converte resposta de erro do Evolution em ChannelError tipado.
 * Garante que o code reflete a natureza do erro (credencial/instancia/etc).
 */
function throwForStatus(
  status: number,
  data: any,
  fallback: string,
  hint?: { conflictMatcher?: (msg: string) => boolean }
): never {
  const message = extractError(data, fallback);
  let code = classifyHttpStatus(status);

  // Refinamentos: Evolution retorna 400 quando instanceName ja existe — preferimos CONFLICT
  if (code === 'BAD_REQUEST' && hint?.conflictMatcher && hint.conflictMatcher(message)) {
    code = 'CONFLICT';
  }

  throw new ChannelError(message, code, {
    providerStatus: status,
    providerBody: data,
  });
}

function mapState(state: unknown): StatusResult['status'] {
  // Evolution retorna: "open" (conectado), "close" (desconectado),
  // "connecting" (gerando QR), "refused" / "qrcode" / outros estados intermediarios.
  switch (state) {
    case 'open':
      return 'connected';
    case 'connecting':
    case 'qrcode':
      return 'connecting';
    case 'close':
    case 'closed':
    case 'logout':
    case 'refused':
      return 'disconnected';
    default:
      return 'disconnected';
  }
}

function normalizeQr(code: string | null | undefined): string | null {
  if (!code) return null;
  // Evolution geralmente retorna como base64 string (sem prefixo data:)
  // ou ja com prefixo. Padronizamos como data URL pra UI.
  if (code.startsWith('data:image')) return code;
  if (code.startsWith('http')) return code;
  return `data:image/png;base64,${code}`;
}

export const evolutionBaileysAdapter: ChannelAdapter = {
  type: 'evolution_baileys',

  async provision(input: ProvisionInput): Promise<ProvisionResult> {
    if (!input.serverUrl) {
      throw new ChannelError('URL do servidor Evolution e obrigatoria', 'BAD_REQUEST');
    }
    if (!input.serverApiKey) {
      throw new ChannelError('API Key global do servidor Evolution e obrigatoria', 'BAD_REQUEST');
    }

    // Slug determinista: nome legivel + companyId truncado
    const slug = input.displayName
      .normalize('NFD')
      .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase()
      .slice(0, 24) || 'agent';
    const instanceName = `${slug}-${input.companyId.slice(0, 8)}-${Date.now().toString(36).slice(-4)}`;

    const body: Record<string, unknown> = {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      groupsIgnore: true,
      readMessages: false,
      webhook: {
        url: input.webhookUrl,
        byEvents: false,
        events: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'CONNECTION_UPDATE',
          'QRCODE_UPDATED',
          'SEND_MESSAGE',
        ],
      },
    };

    if (input.phoneNumber) body.number = input.phoneNumber;

    const res = await evolutionFetch(input.serverUrl, input.serverApiKey, 'POST', '/instance/create', body);

    if (!res.ok) {
      throwForStatus(res.status, res.data, `Falha ao criar instancia (${res.status})`, {
        // Evolution responde 400 com mensagem "instance already in use" — isso e CONFLICT, nao BAD_REQUEST
        conflictMatcher: (msg) =>
          /already.*(use|exist)|already.*registered|instanceName.*exist/i.test(msg),
      });
    }

    // Resposta tipica: { instance: {...}, hash: { apikey: "..." }, qrcode?: { base64, code, pairingCode }, ... }
    const providerInstanceName = res.data?.instance?.instanceName || instanceName;
    const instanceApiKey = typeof res.data?.hash === 'string' ? res.data.hash : res.data?.hash?.apikey || null;
    const qrBase64 = res.data?.qrcode?.base64 || res.data?.qrcode?.code || null;
    const pairingCode = res.data?.qrcode?.pairingCode || null;

    return {
      providerInstanceName,
      instanceApiKey,
      apiUrl: trimUrl(input.serverUrl),
      channelConfig: {
        serverApiKey: input.serverApiKey,
        webhookUrl: input.webhookUrl,
      },
      metadata: res.data,
      qrCode: normalizeQr(qrBase64),
      pairingCode,
    };
  },

  async getQrCode(agent: ChannelAgent): Promise<QrResult> {
    if (!agent.apiUrl) throw new ChannelError('Servidor nao configurado', 'BAD_REQUEST');
    const key = getServerKey(agent);
    if (!key) throw new ChannelError('API Key nao configurada', 'BAD_REQUEST');

    const res = await evolutionFetch(
      agent.apiUrl,
      key,
      'GET',
      `/instance/connect/${encodeURIComponent(agent.instanceName)}`
    );

    if (!res.ok) {
      throwForStatus(res.status, res.data, `Falha ao gerar QR (${res.status})`);
    }

    // Resposta: { pairingCode, code, count } — `code` pode ser base64 ou string
    const code = res.data?.base64 || res.data?.code || null;
    const pairingCode = res.data?.pairingCode || null;

    return {
      qrCode: normalizeQr(code),
      pairingCode,
      status: code ? 'connecting' : 'disconnected',
    };
  },

  async getStatus(agent: ChannelAgent): Promise<StatusResult> {
    if (!agent.apiUrl) throw new ChannelError('Servidor nao configurado', 'BAD_REQUEST');
    const key = getServerKey(agent);
    if (!key) throw new ChannelError('API Key nao configurada', 'BAD_REQUEST');

    const res = await evolutionFetch(
      agent.apiUrl,
      key,
      'GET',
      `/instance/connectionState/${encodeURIComponent(agent.instanceName)}`
    );

    if (!res.ok) {
      // Status e operacao "soft": credencial errada ou instancia removida
      // sao casos fatais que precisam virar erro tipado pra UI tratar.
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        throwForStatus(res.status, res.data, `Falha ao consultar status (${res.status})`);
      }
      return { status: 'error', raw: res.data };
    }

    const state = res.data?.instance?.state ?? res.data?.state;
    return {
      status: mapState(state),
      raw: res.data,
    };
  },

  async disconnect(agent: ChannelAgent): Promise<void> {
    if (!agent.apiUrl) return;
    const key = getServerKey(agent);
    if (!key) return;

    // Erros aqui sao silenciados — se o provider ja nao tem a sessao
    // (404) ou esta offline, o estado local "desconectado" e suficiente.
    try {
      await evolutionFetch(
        agent.apiUrl,
        key,
        'DELETE',
        `/instance/logout/${encodeURIComponent(agent.instanceName)}`
      );
    } catch (e) {
      console.warn(`[evolution_baileys] disconnect error (ignored):`, (e as Error).message);
    }
  },

  async remove(agent: ChannelAgent): Promise<void> {
    if (!agent.apiUrl) return;
    const config = (agent.channelConfig as EvolutionChannelConfig | null) || {};
    // Pro delete usamos a key GLOBAL (admin) pra garantir que vai passar
    // mesmo se a per-instance ja tiver sido invalidada
    const key = config.serverApiKey || agent.instanceApiKey || '';
    if (!key) return;

    // Erros silenciados pelo mesmo motivo: se nao conseguimos remover do
    // provider, o usuario ainda quer apagar o registro local.
    try {
      await evolutionFetch(
        agent.apiUrl,
        key,
        'DELETE',
        `/instance/delete/${encodeURIComponent(agent.instanceName)}`
      );
    } catch (e) {
      console.warn(`[evolution_baileys] remove error (ignored):`, (e as Error).message);
    }
  },

  async sendText(agent: ChannelAgent, input: SendTextInput): Promise<SendTextResult> {
    if (!agent.apiUrl) throw new ChannelError('Servidor nao configurado', 'BAD_REQUEST');
    const key = getServerKey(agent);
    if (!key) throw new ChannelError('API Key nao configurada', 'BAD_REQUEST');

    const body: Record<string, unknown> = {
      number: input.to.replace(/\D/g, ''),
      text: input.text,
    };

    if (input.quotedMessageId) {
      body.quoted = { key: { id: input.quotedMessageId } };
    }

    const res = await evolutionFetch(
      agent.apiUrl,
      key,
      'POST',
      `/message/sendText/${encodeURIComponent(agent.instanceName)}`,
      body
    );

    if (!res.ok) {
      throwForStatus(res.status, res.data, `Falha ao enviar mensagem (${res.status})`);
    }

    const messageId = res.data?.key?.id || res.data?.messageid || res.data?.id || '';
    const status = res.data?.status === 'PENDING' ? 'pending' : 'sent';

    return {
      providerMessageId: messageId,
      status,
      raw: res.data,
    };
  },
};

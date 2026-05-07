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
  body?: unknown
): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`${trimUrl(baseUrl)}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

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
    if (!input.serverUrl) throw new Error('URL do servidor Evolution e obrigatoria');
    if (!input.serverApiKey) throw new Error('API Key global do servidor Evolution e obrigatoria');

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
      throw new Error(extractError(res.data, `Falha ao criar instancia (${res.status})`));
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
    if (!agent.apiUrl) throw new Error('Servidor nao configurado');
    const key = getServerKey(agent);
    if (!key) throw new Error('API Key nao configurada');

    const res = await evolutionFetch(
      agent.apiUrl,
      key,
      'GET',
      `/instance/connect/${encodeURIComponent(agent.instanceName)}`
    );

    if (!res.ok) {
      // 404 = instancia nao existe mais no provider
      throw new Error(extractError(res.data, `Falha ao gerar QR (${res.status})`));
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
    if (!agent.apiUrl) throw new Error('Servidor nao configurado');
    const key = getServerKey(agent);
    if (!key) throw new Error('API Key nao configurada');

    const res = await evolutionFetch(
      agent.apiUrl,
      key,
      'GET',
      `/instance/connectionState/${encodeURIComponent(agent.instanceName)}`
    );

    if (!res.ok) {
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

    await evolutionFetch(
      agent.apiUrl,
      key,
      'DELETE',
      `/instance/logout/${encodeURIComponent(agent.instanceName)}`
    );
    // Erros aqui sao silenciados — se o provider ja nao tem a sessao,
    // o estado local "desconectado" e o que importa.
  },

  async remove(agent: ChannelAgent): Promise<void> {
    if (!agent.apiUrl) return;
    const config = (agent.channelConfig as EvolutionChannelConfig | null) || {};
    // Pro delete usamos a key GLOBAL (admin) pra garantir que vai passar
    // mesmo se a per-instance ja tiver sido invalidada
    const key = config.serverApiKey || agent.instanceApiKey || '';
    if (!key) return;

    await evolutionFetch(
      agent.apiUrl,
      key,
      'DELETE',
      `/instance/delete/${encodeURIComponent(agent.instanceName)}`
    );
  },

  async sendText(agent: ChannelAgent, input: SendTextInput): Promise<SendTextResult> {
    if (!agent.apiUrl) throw new Error('Servidor nao configurado');
    const key = getServerKey(agent);
    if (!key) throw new Error('API Key nao configurada');

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
      throw new Error(extractError(res.data, `Falha ao enviar mensagem (${res.status})`));
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

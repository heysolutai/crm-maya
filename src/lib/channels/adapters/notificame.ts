/**
 * Adapter para NotificaMe Hub (https://hub.notificame.com.br).
 *
 * Diferente de UazAPI/Evolution, o NotificaMe e um agregador multi-canal:
 * voce configura o canal (WhatsApp Cloud, SMS, Email, etc) no painel deles
 * e fala com uma API unica. Nao tem QR code — autenticacao e por API token
 * de conta + channel UUID + sender userId.
 *
 * Auth:
 * - Header: `X-API-Token: <api_token>` (conta-level)
 * - Base URL: https://api.notificame.com.br
 *
 * Endpoints usados:
 * - POST   /v2/channels/whatsapp/messages    enviar mensagem
 * - POST   /v1/subscriptions                 criar webhook (MESSAGE/MESSAGE_STATUS)
 * - GET    /v1/subscriptions/{id}            consultar subscription
 * - DELETE /v1/subscriptions/{id}            remover subscription
 * - GET    /v1/channels                      validar token / status
 *
 * Webhook NotificaMe NAO assina o body (sem HMAC). Defesa em duas camadas:
 * 1. URL inclui agentId em query (?agentId=...)
 * 2. Receiver valida subscriptionId contra channelConfig.subscriptionIds
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

const NOTIFICAME_BASE_URL = 'https://api.notificame.com.br';
const HTTP_CONFLICT = 409;

interface NotificameSubscriptionIds {
  messages?: string;
  messageStatus?: string;
}

interface NotificameChannelConfig {
  channelId?: string;        // UUID do canal no NotificaMe (usado em subscriptions)
  channel?: string;          // tipo do canal (whatsapp/sms/email/...) — default 'whatsapp'
  senderUserId?: string;     // userId da conta (sender identifier em sendMessage)
  webhookUrl?: string;
  subscriptionIds?: NotificameSubscriptionIds;
}

function getConfig(agent: ChannelAgent): NotificameChannelConfig {
  return (agent.channelConfig as NotificameChannelConfig | null) || {};
}

function getApiToken(agent: ChannelAgent): string {
  return agent.instanceApiKey || '';
}

async function notificameFetch(
  apiToken: string,
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
    'X-API-Token': apiToken,
  };

  let res: Response;
  try {
    res = await fetch(`${NOTIFICAME_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as any)?.name === 'AbortError') {
      throw new ChannelError(
        'NotificaMe nao respondeu a tempo (timeout)',
        'PROVIDER_UNREACHABLE',
        { httpStatus: 504 }
      );
    }
    if (isNetworkError(err)) {
      throw new ChannelError(
        'Nao foi possivel conectar ao NotificaMe Hub.',
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
  if (Array.isArray(data?.errors) && data.errors.length) {
    return data.errors.map((e: any) => e.message || e).join('; ');
  }
  return fallback;
}

function throwForStatus(status: number, data: any, fallback: string): never {
  const message = extractError(data, fallback);
  throw new ChannelError(message, classifyHttpStatus(status), {
    providerStatus: status,
    providerBody: data,
  });
}

async function createSubscription(
  apiToken: string,
  url: string,
  channelId: string,
  eventType: 'MESSAGE' | 'MESSAGE_STATUS'
): Promise<string | null> {
  const body = {
    webhook: { url },
    criteria: { channel: channelId },
    eventType,
  };
  const res = await notificameFetch(apiToken, 'POST', '/v1/subscriptions', body);

  if (res.ok) {
    return res.data?.id || res.data?.subscriptionId || null;
  }
  // 409 = ja existe pra essa combinacao (url + channel + eventType).
  // NotificaMe nao retorna o id existente — registramos null e seguimos.
  if (res.status === HTTP_CONFLICT) {
    console.warn(`[notificame] subscription ${eventType} ja existia (409)`);
    return null;
  }
  throwForStatus(res.status, res.data, `Falha ao criar subscription ${eventType}`);
}

async function deleteSubscription(apiToken: string, subscriptionId: string): Promise<void> {
  try {
    await notificameFetch(apiToken, 'DELETE', `/v1/subscriptions/${subscriptionId}`);
  } catch (e) {
    console.warn(`[notificame] delete subscription failed:`, (e as Error).message);
  }
}

export const notificameAdapter: ChannelAdapter = {
  type: 'notificame',

  async provision(input: ProvisionInput): Promise<ProvisionResult> {
    const apiToken = input.serverApiKey;
    if (!apiToken) {
      throw new ChannelError('API Token do NotificaMe e obrigatorio', 'BAD_REQUEST');
    }

    const extra = (input.extra || {}) as {
      channelId?: string;
      senderUserId?: string;
      channel?: string;
    };
    const channelId = extra.channelId;
    const senderUserId = extra.senderUserId;
    const channel = extra.channel || 'whatsapp';

    if (!channelId) {
      throw new ChannelError('Channel ID (UUID) do NotificaMe e obrigatorio', 'BAD_REQUEST');
    }
    if (!senderUserId) {
      throw new ChannelError('Sender User ID do NotificaMe e obrigatorio', 'BAD_REQUEST');
    }

    // 1) Valida token — GET /v1/channels deve retornar 200
    const validate = await notificameFetch(apiToken, 'GET', '/v1/channels');
    if (!validate.ok) {
      throwForStatus(validate.status, validate.data, 'Token NotificaMe invalido');
    }

    // 2) Cria subscriptions para MESSAGE e MESSAGE_STATUS apontando pro webhook
    let messageSubId: string | null = null;
    let statusSubId: string | null = null;
    try {
      messageSubId = await createSubscription(apiToken, input.webhookUrl, channelId, 'MESSAGE');
    } catch (e) {
      console.warn('[notificame] subscription MESSAGE falhou:', (e as Error).message);
    }
    try {
      statusSubId = await createSubscription(apiToken, input.webhookUrl, channelId, 'MESSAGE_STATUS');
    } catch (e) {
      console.warn('[notificame] subscription MESSAGE_STATUS falhou:', (e as Error).message);
    }

    const instanceName = `notificame-${channelId.slice(0, 8)}-${Date.now().toString(36).slice(-4)}`;

    return {
      providerInstanceName: instanceName,
      instanceApiKey: apiToken,
      apiUrl: NOTIFICAME_BASE_URL,
      channelConfig: {
        channelId,
        channel,
        senderUserId,
        webhookUrl: input.webhookUrl,
        subscriptionIds: {
          messages: messageSubId || undefined,
          messageStatus: statusSubId || undefined,
        },
      } as Record<string, unknown>,
      metadata: { provider: 'notificame', channelId, channel },
      // NotificaMe nao tem QR (token-mode)
      qrCode: null,
      pairingCode: null,
    };
  },

  async getQrCode(_agent: ChannelAgent): Promise<QrResult> {
    // Token-mode: nao ha QR. Status sempre "connected" se token estiver valido.
    return { qrCode: null, status: 'connected' };
  },

  async getStatus(agent: ChannelAgent): Promise<StatusResult> {
    const apiToken = getApiToken(agent);
    if (!apiToken) throw new ChannelError('Token nao configurado', 'BAD_REQUEST');

    const res = await notificameFetch(apiToken, 'GET', '/v1/channels');
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throwForStatus(res.status, res.data, 'Token NotificaMe invalido');
      }
      return { status: 'error', raw: res.data };
    }

    // Token valido → conectado. NotificaMe nao expoe status per-channel via API
    // publica desse endpoint; consideramos disponivel se o token funciona.
    return {
      status: 'connected',
      phoneNumber: agent.phoneNumber || null,
      raw: res.data,
    };
  },

  async disconnect(_agent: ChannelAgent): Promise<void> {
    // No-op: NotificaMe nao tem conceito de "logout" da sessao. Pra desconectar
    // de verdade, o usuario deleta o agente (remove subscriptions).
  },

  async remove(agent: ChannelAgent): Promise<void> {
    const apiToken = getApiToken(agent);
    if (!apiToken) return;

    const config = getConfig(agent);
    const subs = config.subscriptionIds || {};
    if (subs.messages) await deleteSubscription(apiToken, subs.messages);
    if (subs.messageStatus) await deleteSubscription(apiToken, subs.messageStatus);
  },

  async sendText(agent: ChannelAgent, input: SendTextInput): Promise<SendTextResult> {
    const apiToken = getApiToken(agent);
    if (!apiToken) throw new ChannelError('Token nao configurado', 'BAD_REQUEST');

    const config = getConfig(agent);
    if (!config.senderUserId) {
      throw new ChannelError('Sender User ID nao configurado no agente', 'BAD_REQUEST');
    }

    const channel = config.channel || 'whatsapp';
    const isV2 = channel === 'whatsapp' || channel === 'instagram' || channel === 'tiktok';
    const path = isV2
      ? `/v2/channels/${channel}/messages`
      : `/v1/channels/${channel}/messages`;

    const body = {
      from: config.senderUserId,
      to: input.to.replace(/\D/g, ''),
      contents: [{ type: 'text', text: input.text }],
    };

    const res = await notificameFetch(apiToken, 'POST', path, body);
    if (!res.ok) {
      throwForStatus(res.status, res.data, `Falha ao enviar mensagem (${res.status})`);
    }

    const messageId = res.data?.id || res.data?.messageId || '';
    return {
      providerMessageId: String(messageId),
      status: 'sent',
      raw: res.data,
    };
  },
};

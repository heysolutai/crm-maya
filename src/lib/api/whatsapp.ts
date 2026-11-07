import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { WhatsAppInstance } from './types';
import { getUAZMessageId } from './database';
import { prepararTextoParaWhatsApp } from '@/lib/whatsapp/texto-whatsapp';
import { getAdapter } from '@/lib/channels/registry';
import type { ChannelAgent, SendMediaInput } from '@/lib/channels/adapter';
import { publishEvent } from '@/lib/realtime';
import { falhaDaMensagem, semFalhaDeEnvio, textoDaFalhaEnvio } from '@/lib/erros/envio';

// ---------------------------------------------------------------------------
// Marcacao de falha / sucesso do envio (fonte unica pra todos os canais)

type Meta = Record<string, unknown>;

function comoMeta(v: unknown): Meta {
  return v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Meta) } : {};
}

/**
 * A mensagem NAO chegou no WhatsApp: readStatus 'failed' + send_error (texto
 * cru, ate 500 caracteres) + failed_at, MESCLADOS no metadata (nunca
 * substitui). Avisa as telas abertas (message:update) pra bolha ficar
 * vermelha na hora. Nunca lanca. Devolve o texto cru gravado.
 *
 * companyId opcional: quando quem chama tem, a busca fica presa ao restaurante.
 */
export async function marcarFalhaEnvio(
  messageId: string,
  erro: unknown,
  opcoes: { companyId?: string } = {},
): Promise<string> {
  const texto = textoDaFalhaEnvio(erro);
  try {
    const row = await prisma.message.findFirst({
      where: { id: messageId, ...(opcoes.companyId ? { conversation: { companyId: opcoes.companyId } } : {}) },
      select: { metadata: true, conversationId: true, conversation: { select: { companyId: true } } },
    });
    if (!row) return texto;
    const metadata = comoMeta(row.metadata);
    // whatsapp_error era o nome antigo do mesmo marcador: fica so o atual.
    delete metadata.whatsapp_error;
    metadata.send_error = texto;
    metadata.failed_at = new Date().toISOString();
    await prisma.message.update({
      where: { id: messageId },
      data: { readStatus: 'failed', metadata: metadata as Prisma.InputJsonObject },
    });
    await publishEvent(row.conversation.companyId, {
      type: 'message:update',
      conversationId: row.conversationId,
      messageId,
      patch: { readStatus: 'failed', metadata },
    });
  } catch (e) {
    console.error('[envio] falha ao marcar mensagem como nao enviada', messageId, e);
  }
  return texto;
}

/**
 * O envio deu certo: readStatus 'sent', id do provedor (quando houver) e
 * metadata MESCLADO sem os marcadores de falha. So avisa as telas quando a
 * mensagem estava marcada como falha (reenvio): envio normal nao gera evento
 * extra. Nunca lanca.
 */
export async function marcarEnvioOk(
  messageId: string,
  dados: {
    providerMessageId?: string | null;
    /** Campos novos do metadata (mesclados por cima). */
    metadata?: Meta;
    /** Chaves a tirar do metadata (ex.: eco do request). */
    remover?: string[];
    companyId?: string;
  } = {},
): Promise<{ metadata: Meta } | null> {
  try {
    const row = await prisma.message.findFirst({
      where: { id: messageId, ...(dados.companyId ? { conversation: { companyId: dados.companyId } } : {}) },
      select: { metadata: true, readStatus: true, conversationId: true, conversation: { select: { companyId: true } } },
    });
    if (!row) return null;

    const tinhaFalha = falhaDaMensagem(row.metadata, row.readStatus) !== null;
    const metadata = semFalhaDeEnvio(row.metadata);
    for (const k of dados.remover ?? []) delete metadata[k];
    Object.assign(metadata, dados.metadata ?? {});

    const providerId = typeof dados.providerMessageId === 'string' ? dados.providerMessageId.trim() : '';
    const base = { readStatus: 'sent', metadata: metadata as Prisma.InputJsonObject };
    try {
      await prisma.message.update({
        where: { id: messageId },
        data: providerId ? { ...base, uazMessageId: providerId } : base,
      });
    } catch (e) {
      if (!providerId) throw e;
      // uazMessageId e unico: se o eco do webhook ja criou outra linha com
      // esse id, grava o resto mesmo assim.
      console.warn('[envio] nao gravou o id do provedor, segue sem ele:', messageId, (e as Error)?.message);
      await prisma.message.update({ where: { id: messageId }, data: base });
    }

    if (tinhaFalha) {
      await publishEvent(row.conversation.companyId, {
        type: 'message:update',
        conversationId: row.conversationId,
        messageId,
        patch: { readStatus: 'sent', metadata },
      });
    }
    return { metadata };
  } catch (e) {
    console.warn('[envio] falha ao marcar mensagem como enviada', messageId, e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Envio (formato UazAPI; conversa de inbox WhatsApp Cloud vai pelo adapter)

export async function sendToWhatsApp(
  instance: WhatsAppInstance,
  endpoint: string,
  payload: any,
  messageId: string
): Promise<{ success: boolean; error?: string }> {
  const rawPhone = payload.phone ?? payload.number;
  if (!rawPhone) {
    throw new Error('phone or number is required');
  }
  const cleanPhone = rawPhone.replace(/[^0-9]/g, '');

  try {
    // Conversa de conexao "Espelho" e somente leitura. Sem isso a mensagem
    // sairia pela `instance` (primeira inbox ativa), ou seja, por OUTRO numero.
    const espelho = await prisma.message.findFirst({
      where: { id: messageId, conversation: { inbox: { channelType: 'espelho' } } },
      select: { id: true },
    });
    if (espelho) {
      const erro = await marcarFalhaEnvio(
        messageId,
        'Conexão espelho (somente leitura): esta conversa não envia mensagens pelo CRM.'
      );
      return { success: false, error: erro };
    }

    if (payload.replyToMessageId) {
      const uazMessageId = await getUAZMessageId(payload.replyToMessageId);
      if (uazMessageId) {
        payload.replyid = uazMessageId;
        console.log(`[WhatsApp] Reply to message: ${uazMessageId}`);
      }
      delete payload.replyToMessageId;
    }

    // Conversa de inbox WhatsApp Cloud (API oficial) sai pelo adapter, nao
    // pela UazAPI. A inbox vem da CONVERSA da mensagem: `instance` e a
    // primeira inbox ativa do restaurante e pode ser outro numero.
    const cloudInbox = await findCloudInboxForMessage(messageId);
    if (cloudInbox) {
      return await sendViaCloud(cloudInbox, endpoint, payload, messageId, cleanPhone);
    }

    const url = `${instance.api_url}${endpoint}`;
    console.log('[WhatsApp API] Calling:', url, '| Phone:', cleanPhone);

    const { phone, number, fromAI, conversationId, company_id, ...rest } = payload;
    // Markdown da IA e "\n" literal nao existem pro WhatsApp; corrige aqui, no funil.
    if (typeof rest.text === 'string') rest.text = prepararTextoParaWhatsApp(rest.text);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': instance.instance_api_key,
      },
      body: JSON.stringify({
        ...rest,
        number: cleanPhone,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('[WhatsApp API] Error:', response.status, errorText);

      if (response.status === 401 || response.status === 403) {
        prisma.inbox.update({
          where: { id: instance.id },
          data: { status: 'disconnected', errorMessage: 'Authentication failed' },
        }).catch(() => {});
      }

      // O corpo do provedor costuma dizer o motivo ("not on WhatsApp"...):
      // vai junto pro tradutor e pro super-admin.
      const corpo = errorText.replace(/\s+/g, ' ').trim().slice(0, 300);
      const erro = await marcarFalhaEnvio(messageId, `API error: ${response.status}${corpo ? ` - ${corpo}` : ''}`);

      return { success: false, error: erro };
    }

    const responseData = await response.json();

    const rawUazMessageId = responseData.message_id || responseData.id || responseData.key?.id;
    const uazMessageId = typeof rawUazMessageId === 'string' && rawUazMessageId.includes(':')
      ? rawUazMessageId.split(':').pop()
      : rawUazMessageId;
    console.log('[WhatsApp API] Success, UAZ ID:', uazMessageId);

    // IMPORTANTE: await síncrono para garantir que o uazMessageId esteja persistido
    // ANTES do webhook de eco da UAZapi chegar. Sem isso, o webhook pode não
    // encontrar a mensagem na verificação de duplicata e criar uma cópia.
    // Metadata mesclado (docName, legenda etc. ficam); some a falha antiga e o
    // eco do request (uaz_payload), como antes.
    await marcarEnvioOk(messageId, {
      providerMessageId: typeof uazMessageId === 'string' ? uazMessageId : null,
      remover: ['uaz_payload'],
      metadata: {
        whatsapp_message_id: uazMessageId,
        whatsapp_status: responseData.status || 'sent',
        sent_via: 'uaz_api_direct',
        sent_successfully_at: new Date().toISOString(),
      },
    });

    return { success: true };

  } catch (error) {
    console.error('[WhatsApp API] Exception:', error);
    const erro = await marcarFalhaEnvio(messageId, error);
    return {
      success: false,
      error: erro,
    };
  }
}

// ---------------------------------------------------------------------------
// WhatsApp Cloud

type CloudInbox = ChannelAgent;

async function findCloudInboxForMessage(messageId: string): Promise<CloudInbox | null> {
  const row = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      conversation: {
        select: {
          inbox: {
            select: {
              id: true, companyId: true, channelType: true, instanceName: true, displayName: true,
              phoneNumber: true, apiUrl: true, instanceApiKey: true, channelConfig: true, metadata: true,
            },
          },
        },
      },
    },
  });
  const inbox = row?.conversation?.inbox;
  if (!inbox || inbox.channelType !== 'whatsapp_cloud') return null;
  return {
    ...inbox,
    channelType: 'whatsapp_cloud',
    channelConfig: (inbox.channelConfig ?? null) as Record<string, unknown> | null,
    metadata: (inbox.metadata ?? null) as Record<string, unknown> | null,
  };
}

const UAZ_TO_CLOUD_MEDIA: Record<string, SendMediaInput['type']> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  ptt: 'audio',
  myaudio: 'audio',
  document: 'document',
  sticker: 'sticker',
};

/**
 * Traduz as chamadas no formato UazAPI (/send/text, /send/media) pro adapter
 * do WhatsApp Cloud e grava o resultado na mensagem do mesmo jeito.
 */
async function sendViaCloud(
  inbox: CloudInbox,
  endpoint: string,
  payload: Record<string, unknown>,
  messageId: string,
  to: string,
): Promise<{ success: boolean; error?: string }> {
  const adapter = getAdapter('whatsapp_cloud');
  const quotedMessageId = typeof payload.replyid === 'string' ? payload.replyid : undefined;

  try {
    let result;
    if (endpoint === '/send/text') {
      result = await adapter.sendText(inbox, { to, text: String(payload.text ?? ''), quotedMessageId });
    } else if (endpoint === '/send/media') {
      const type = UAZ_TO_CLOUD_MEDIA[String(payload.type ?? 'document')] ?? 'document';
      const url = typeof payload.file === 'string' ? payload.file : '';
      if (!url.startsWith('https://')) {
        throw new Error('WhatsApp Cloud so envia midia por URL publica (https)');
      }
      if (!adapter.sendMedia) throw new Error('Envio de midia nao suportado neste canal');
      result = await adapter.sendMedia(inbox, {
        to,
        type,
        url,
        caption: typeof payload.text === 'string' ? payload.text : undefined,
        fileName: typeof payload.docName === 'string' ? payload.docName : undefined,
        quotedMessageId,
      });
    } else {
      throw new Error(`Envio ${endpoint} nao suportado no WhatsApp Cloud`);
    }

    await marcarEnvioOk(messageId, {
      providerMessageId: result.providerMessageId || null,
      remover: ['uaz_payload'],
      metadata: {
        whatsapp_message_id: result.providerMessageId,
        sent_via: 'whatsapp_cloud',
        sent_successfully_at: new Date().toISOString(),
      },
    });

    return { success: true };
  } catch (error) {
    console.error('[WhatsApp Cloud] envio falhou:', error instanceof Error ? error.message : error);
    const erro = await marcarFalhaEnvio(messageId, error);
    return { success: false, error: erro };
  }
}

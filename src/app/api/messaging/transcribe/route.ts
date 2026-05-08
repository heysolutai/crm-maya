import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, unauthorizedResponse } from '@/lib/api/cors';
import { handleApiErrorCors } from '@/lib/api/errors'
import { getSystemSettingFresh } from '@/lib/system-settings';

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

/**
 * Transcricao sob demanda (frontend clicou "transcrever" numa msg de audio).
 *
 * Estrategia em 2 nivels:
 *   1. UazAPI: download + transcribe na mesma chamada (return_base64=true,
 *      transcribe=true). Se UazAPI retornar a transcricao, usamos.
 *   2. Fallback Whisper: se UazAPI baixou o audio mas nao deu transcricao,
 *      enviamos o buffer pra OpenAI Whisper.
 *
 * Resolucao de OpenAI key: per-agent (aiConfiguration) -> per-system (system_config) -> env.
 */
async function transcribeWithWhisper(
  buffer: Buffer,
  mimeType: string,
  openAiKey: string
): Promise<string | null> {
  try {
    const ext = (mimeType.split('/')[1] || 'ogg').split(';')[0].trim();
    const filename = `audio.${ext}`;

    const form = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    form.append('file', blob, filename);
    form.append('model', 'whisper-1');
    form.append('response_format', 'json');
    form.append('language', 'pt');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openAiKey}` },
      body: form,
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error(`[Transcription] Whisper falhou (${res.status}):`, txt.slice(0, 300));
      return null;
    }
    const data = await res.json();
    return ((data?.text || '') as string).trim() || null;
  } catch (err: any) {
    console.error('[Transcription] Whisper exception:', err.message);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    let authResult;
    try {
      authResult = await authenticate(req);
    } catch {
      return unauthorizedResponse('Authentication required');
    }

    const { messageId } = await req.json();
    if (!messageId) return jsonResponse({ error: 'messageId is required' }, 400);

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        uazMessageId: true,
        messageText: true,
        metadata: true,
        conversationId: true,
        conversation: {
          select: {
            companyId: true,
            whatsappInstanceId: true,
          },
        },
      },
    });

    if (!message) return jsonResponse({ error: 'Message not found' }, 404);

    const companyId = message.conversation.companyId;
    if (companyId !== authResult.companyId) {
      return jsonResponse({ error: 'Forbidden: message does not belong to your company' }, 403);
    }

    if (!message.uazMessageId) {
      return jsonResponse({ error: 'Message does not have provider message ID' }, 400);
    }

    // Cache: ja temos transcricao salva
    const cachedMeta = (message.metadata as any) || {};
    if (cachedMeta.transcription) {
      return jsonResponse({ success: true, transcription: cachedMeta.transcription, cached: true });
    }
    if (
      message.messageText &&
      !['[Áudio]', '[Media]', '🎤 Áudio', '[Audio - transcricao falhou]'].includes(message.messageText) &&
      cachedMeta.transcribed
    ) {
      return jsonResponse({ success: true, transcription: message.messageText, cached: true });
    }

    // Resolve a instancia: prioriza a vinculada a conversa (multi-agent),
    // cai pra primeira ativa (legado single-instance).
    const instance = message.conversation.whatsappInstanceId
      ? await prisma.whatsappInstance.findFirst({
          where: { id: message.conversation.whatsappInstanceId, companyId },
          select: { instanceApiKey: true, apiUrl: true },
        })
      : await prisma.whatsappInstance.findFirst({
          where: { companyId, isActive: true },
          select: { instanceApiKey: true, apiUrl: true },
        });

    if (!instance?.apiUrl || !instance?.instanceApiKey) {
      return jsonResponse({ error: 'WhatsApp instance not configured' }, 503);
    }

    // Resolve OpenAI key: per-agent -> system_config -> env (via getSystemSettingFresh)
    const aiConfig = message.conversation.whatsappInstanceId
      ? await prisma.aiConfiguration.findFirst({
          where: { whatsappInstanceId: message.conversation.whatsappInstanceId, isActive: true },
          select: { apiKeys: true },
        })
      : await prisma.aiConfiguration.findFirst({
          where: { companyId, isActive: true },
          select: { apiKeys: true },
        });

    const perAgentKey = (aiConfig?.apiKeys as any)?.openai;
    const openAiKey = (perAgentKey && String(perAgentKey).trim()) || (await getSystemSettingFresh('default_openai_api_key'));
    if (!openAiKey) {
      return jsonResponse({ error: 'OpenAI API key not configured (super-admin > Sistema)' }, 503);
    }

    console.log('[Transcription] Calling UAZapi for message:', message.uazMessageId);

    // Pede base64 + transcricao na mesma chamada — se transcricao falhar,
    // ainda temos o buffer pra mandar pro Whisper.
    const response = await fetch(`${instance.apiUrl}/message/download`, {
      method: 'POST',
      headers: {
        'token': instance.instanceApiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        id: message.uazMessageId,
        return_base64: true,
        generate_mp3: false,
        return_link: false,
        transcribe: true,
        openai_apikey: openAiKey,
        download_quoted: false,
      }),
    });

    if (!response.ok) {
      const errTxt = await response.text();
      console.error(`[Transcription] UAZapi error (${response.status}):`, errTxt.slice(0, 300));
      return jsonResponse({ error: `UAZapi download falhou (${response.status})` }, 502);
    }

    const data = await response.json();
    let transcription: string | null = data.transcription || data.text || null;
    let source: 'uazapi' | 'openai_whisper' = 'uazapi';

    // Fallback Whisper quando UazAPI nao deu transcricao mas baixou o audio
    if (!transcription) {
      const rawBase64: string | undefined = data.base64Data || data.base64 || data.data;
      const mimeType: string = data.mimetype || data.mimeType || 'audio/ogg';
      if (rawBase64 && rawBase64.length > 10) {
        const commaIdx = rawBase64.indexOf(',');
        const clean = (commaIdx !== -1 && commaIdx < 100 ? rawBase64.slice(commaIdx + 1) : rawBase64).replace(/[\s\r\n]/g, '');
        try {
          const buffer = Buffer.from(clean, 'base64');
          if (buffer.length > 0) {
            console.log('[Transcription] UazAPI nao retornou transcricao; tentando Whisper direto');
            transcription = await transcribeWithWhisper(buffer, mimeType.split(';')[0].trim(), openAiKey);
            if (transcription) {
              source = 'openai_whisper';
              console.log('[Transcription] Whisper fallback OK');
            }
          }
        } catch (decodeErr) {
          console.error('[Transcription] base64 decode falhou:', decodeErr);
        }
      }
    }

    if (!transcription) {
      return jsonResponse({ error: 'Transcricao nao retornada pelo provider nem pelo Whisper' }, 502);
    }

    console.log(`[Transcription] Success (${source}):`, transcription.substring(0, 100));

    await prisma.message.update({
      where: { id: messageId },
      data: {
        metadata: {
          ...((message.metadata as any) || {}),
          transcription,
          transcribed: true,
          transcription_source: source === 'uazapi' ? 'uazapi_openai' : 'openai_whisper',
          transcribed_at: new Date().toISOString(),
        },
      },
    });

    return jsonResponse({ success: true, transcription, cached: false, source });
  } catch (error) {
    return handleApiErrorCors(error, '[Transcription] Error')
  }
}

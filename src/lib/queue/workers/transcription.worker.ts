import { Worker, Job } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type TranscriptionJob, enqueueN8NWebhook } from '../queues'
import { prisma } from '@/lib/db'
import { uploadToB2, buildB2Key, MIME_TO_EXT } from '@/lib/storage'
import { getSystemSetting } from '@/lib/system-settings'

interface UazDownloadResult {
  transcription: string | null
  buffer: Buffer | null
  mimeType: string
}

// Pede base64 + transcricao na mesma call do UAZapi /message/download.
// Os dois sao flags independentes, entao economiza uma round-trip.
async function fetchAudioFromUazAPI(
  messageKey: string,
  instanceApiKey: string,
  instanceApiUrl: string,
  openAiKey: string
): Promise<UazDownloadResult> {
  const empty: UazDownloadResult = { transcription: null, buffer: null, mimeType: 'audio/ogg' }
  try {
    const url = `${instanceApiUrl}/message/download`
    console.log(`[Transcription Worker] Calling UazAPI: ${url}, id: ${messageKey}`)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': instanceApiKey,
      },
      body: JSON.stringify({
        id: messageKey,
        return_base64: true, // pega bytes pra subir no B2
        generate_mp3: false,
        return_link: false,
        transcribe: true, // pega transcricao na mesma chamada
        openai_apikey: openAiKey,
        download_quoted: false,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Transcription Worker] UazAPI error (${response.status}):`, errorText)
      return empty
    }

    const result = await response.json()
    console.log(`[Transcription Worker] UazAPI response keys:`, Object.keys(result))

    const transcription: string | null = result.transcription || result.text || null
    const rawBase64 = result.base64Data || result.base64 || result.data || result.file || result.content
    const mimeType: string = result.mimetype || result.mimeType || result.mime_type || 'audio/ogg'

    let buffer: Buffer | null = null
    if (rawBase64 && typeof rawBase64 === 'string' && rawBase64.length > 10) {
      let clean = rawBase64
      const commaIdx = clean.indexOf(',')
      if (commaIdx !== -1 && commaIdx < 100) clean = clean.substring(commaIdx + 1)
      clean = clean.replace(/[\s\r\n]/g, '')
      try {
        buffer = Buffer.from(clean, 'base64')
        if (buffer.length === 0) buffer = null
      } catch (decodeErr) {
        console.error('[Transcription Worker] base64 decode falhou:', decodeErr)
      }
    }

    return {
      transcription,
      buffer,
      mimeType: mimeType.split(';')[0].trim(),
    }
  } catch (err: any) {
    console.error('[Transcription Worker] UazAPI exception:', err.message)
    return empty
  }
}

async function processTranscription(job: Job<TranscriptionJob>) {
  const {
    messageId, conversationId, companyId,
    instanceApiUrl, instanceApiKey, messageKey,
    n8nWebhookUrl, n8nPayload,
  } = job.data

  console.log(`[Transcription Worker] Processing job ${job.id} for message ${messageId}`)

  const openAiKey = await getSystemSetting('default_openai_api_key')
  if (!openAiKey) {
    console.warn(`[Transcription Worker] No default OpenAI API key configured (super-admin > Sistema)`)
    return { messageId, transcription: null, reason: 'no_api_key' }
  }

  if (!instanceApiUrl || !instanceApiKey || !messageKey) {
    console.warn(`[Transcription Worker] Missing UazAPI credentials for message ${messageId}`)
    return { messageId, transcription: null, reason: 'missing_instance' }
  }

  const { transcription, buffer, mimeType } = await fetchAudioFromUazAPI(
    messageKey, instanceApiKey, instanceApiUrl, openAiKey
  )

  // Sobe os bytes pro B2 antes de qualquer outra coisa — assim o player do
  // frontend deixa de bater na URL criptografada do WhatsApp (que da 403).
  let b2Url: string | null = null
  if (buffer && buffer.length > 0) {
    try {
      const ext = MIME_TO_EXT[mimeType] || mimeType.split('/')[1] || 'ogg'
      const key = buildB2Key('audio', companyId, conversationId, ext)
      b2Url = await uploadToB2(buffer, key, mimeType)
      console.log(`[Transcription Worker] B2 upload OK: ${b2Url} (${buffer.length} bytes, ${mimeType})`)
    } catch (uploadErr: any) {
      console.error('[Transcription Worker] B2 upload falhou:', uploadErr?.message)
    }
  } else {
    console.warn('[Transcription Worker] UazAPI nao retornou base64 do audio (mediaUrl ficara como veio do webhook)')
  }

  // Le metadata atual pra preservar campos existentes (ex: docName, fileSize)
  const existing = await prisma.message.findUnique({
    where: { id: messageId },
    select: { metadata: true },
  })
  const prevMeta = (existing?.metadata as Record<string, unknown>) || {}

  if (transcription) {
    console.log(`[Transcription Worker] Transcription: "${transcription.substring(0, 100)}"`)

    await prisma.message.update({
      where: { id: messageId },
      data: {
        messageText: transcription,
        ...(b2Url ? { mediaUrl: b2Url } : {}),
        metadata: {
          ...prevMeta,
          transcribed: true,
          transcription_source: 'uazapi',
          transcribed_at: new Date().toISOString(),
        } as any,
      },
    })

    if (n8nWebhookUrl && n8nPayload) {
      await enqueueN8NWebhook({
        webhookUrl: n8nWebhookUrl,
        payload: {
          ...n8nPayload,
          conteudo: transcription,
          tipo_mensagem: 'audio',
          // Repassa URL do B2 pra n8n receber link estavel em vez do criptografado
          ...(b2Url ? { media_url: b2Url } : {}),
        },
        companyId,
        conversationId,
        messageId,
      })
      console.log(`[Transcription Worker] Sent N8N webhook with transcribed audio`)
    }
  } else {
    console.error(`[Transcription Worker] Transcription failed for message ${messageId}`)

    // Mesmo sem transcricao, salva a mediaUrl do B2 se conseguimos baixar.
    await prisma.message.update({
      where: { id: messageId },
      data: {
        messageText: '[Audio - transcricao falhou]',
        ...(b2Url ? { mediaUrl: b2Url } : {}),
        metadata: {
          ...prevMeta,
          transcribed: false,
          transcription_error: true,
          transcription_attempted_at: new Date().toISOString(),
        } as any,
      },
    })
  }

  return { messageId, transcription: !!transcription, mediaUrlUpdated: !!b2Url }
}

let worker: Worker<TranscriptionJob> | null = null

export function startTranscriptionWorker() {
  if (worker) return worker

  worker = new Worker<TranscriptionJob>(
    QUEUE_NAMES.TRANSCRIPTION,
    processTranscription,
    {
      connection: getRedisConnection(),
      concurrency: 3,
      limiter: {
        max: 10,
        duration: 60000,
      },
    }
  )

  worker.on('completed', (job) => {
    console.log(`[Transcription Worker] Job ${job.id} completed`)
  })

  worker.on('failed', (job, err) => {
    console.error(`[Transcription Worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message)
  })

  console.log('[Transcription Worker] Started')
  return worker
}

export function stopTranscriptionWorker() {
  if (worker) {
    worker.close()
    worker = null
  }
}

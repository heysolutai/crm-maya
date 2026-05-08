import { Worker, Job } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type TranscriptionJob, enqueueN8NWebhook } from '../queues'
import { prisma } from '@/lib/db'
import { uploadToB2, buildB2Key, MIME_TO_EXT } from '@/lib/storage'
import { getSystemSettingFresh } from '@/lib/system-settings'

interface UazDownloadResult {
  transcription: string | null
  buffer: Buffer | null
  mimeType: string
  /** Mensagem do provider quando transcricao falhou (pra log/debug) */
  transcriptionError?: string
}

/**
 * Fallback: transcreve direto pelo Whisper da OpenAI quando o UazAPI
 * nao retorna transcricao. Usa o buffer ja baixado.
 */
async function transcribeWithWhisper(
  buffer: Buffer,
  mimeType: string,
  openAiKey: string
): Promise<string | null> {
  try {
    const ext = (mimeType.split('/')[1] || 'ogg').split(';')[0].trim()
    const filename = `audio.${ext}`

    const form = new FormData()
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType })
    form.append('file', blob, filename)
    form.append('model', 'whisper-1')
    form.append('response_format', 'json')
    form.append('language', 'pt')

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiKey}`,
      },
      body: form,
    })

    if (!res.ok) {
      const txt = await res.text()
      console.error(`[Transcription Worker] Whisper falhou (${res.status}):`, txt.slice(0, 300))
      return null
    }

    const data = await res.json()
    const text: string = (data?.text || '').trim()
    return text || null
  } catch (err: any) {
    console.error('[Transcription Worker] Whisper exception:', err.message)
    return null
  }
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
    const transcriptionError: string | undefined =
      result.transcription_error || result.transcriptionError || result.error || undefined
    if (!transcription && transcriptionError) {
      console.warn('[Transcription Worker] UazAPI nao retornou transcricao:', transcriptionError)
    }
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
      transcriptionError,
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

  // Le sempre fresh (sem cache) — worker de baixa frequencia, importante
  // pegar valor recem-salvo na UI ou em outros processos do cluster.
  const openAiKey = await getSystemSettingFresh('default_openai_api_key')
  if (!openAiKey) {
    console.warn(`[Transcription Worker] No default OpenAI API key configured (super-admin > Sistema)`)
    return { messageId, transcription: null, reason: 'no_api_key' }
  }
  console.log(`[Transcription Worker] Using OpenAI key: ...${openAiKey.slice(-4)}`)

  if (!instanceApiUrl || !instanceApiKey || !messageKey) {
    console.warn(`[Transcription Worker] Missing UazAPI credentials for message ${messageId}`)
    return { messageId, transcription: null, reason: 'missing_instance' }
  }

  const downloadResult = await fetchAudioFromUazAPI(
    messageKey, instanceApiKey, instanceApiUrl, openAiKey
  )
  let transcription = downloadResult.transcription
  const { buffer, mimeType, transcriptionError } = downloadResult

  // Fallback: se UazAPI nao deu transcricao mas baixou o audio, chamamos
  // o Whisper da OpenAI direto. Cobre casos em que o UazAPI nao expoe a
  // transcricao na response (bug ou versao antiga) ou a key dele falhou.
  if (!transcription && buffer && buffer.length > 0) {
    console.log('[Transcription Worker] UazAPI nao retornou transcricao; tentando Whisper direto')
    transcription = await transcribeWithWhisper(buffer, mimeType, openAiKey)
    if (transcription) {
      console.log('[Transcription Worker] Whisper fallback OK')
    }
  }

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

    // Quem transcreveu? UazAPI quando veio na primeira chamada; senao foi Whisper direto.
    const transcriptionSource = downloadResult.transcription ? 'uazapi' : 'openai_whisper'

    await prisma.message.update({
      where: { id: messageId },
      data: {
        messageText: transcription,
        ...(b2Url ? { mediaUrl: b2Url } : {}),
        metadata: {
          ...prevMeta,
          transcribed: true,
          transcription_source: transcriptionSource,
          transcribed_at: new Date().toISOString(),
          ...(transcriptionError ? { uazapi_transcription_error: transcriptionError } : {}),
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
    console.error(
      `[Transcription Worker] Transcription failed for message ${messageId}`,
      transcriptionError ? `(uazapi: ${transcriptionError})` : ''
    )

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
          ...(transcriptionError ? { uazapi_transcription_error: transcriptionError } : {}),
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

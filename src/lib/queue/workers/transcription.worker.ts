import { Worker, Job } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type TranscriptionJob, enqueueN8NWebhook } from '../queues'
import { prisma } from '@/lib/db'

// Transcribe audio via UazAPI (calls OpenAI Whisper internally)
async function transcribeViaUazAPI(
  messageKey: string,
  instanceApiKey: string,
  instanceApiUrl: string,
  openAiKey: string
): Promise<string | null> {
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
        return_base64: false,
        generate_mp3: false,
        return_link: false,
        transcribe: true,
        openai_apikey: openAiKey,
        download_quoted: false,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Transcription Worker] UazAPI error (${response.status}):`, errorText)
      return null
    }

    const result = await response.json()
    console.log(`[Transcription Worker] UazAPI response keys:`, Object.keys(result))

    // UazAPI returns transcription in the response
    if (result.transcription) {
      return result.transcription
    }
    if (result.text) {
      return result.text
    }

    console.error('[Transcription Worker] UazAPI returned no transcription:', JSON.stringify(result).substring(0, 300))
    return null
  } catch (err: any) {
    console.error('[Transcription Worker] UazAPI exception:', err.message)
    return null
  }
}

async function processTranscription(job: Job<TranscriptionJob>) {
  const {
    messageId, conversationId, companyId,
    instanceApiUrl, instanceApiKey, messageKey,
    n8nWebhookUrl, n8nPayload,
  } = job.data

  console.log(`[Transcription Worker] Processing job ${job.id} for message ${messageId}`)

  const openAiKey = process.env.DEFAULT_OPENAI_API_KEY
  if (!openAiKey) {
    console.warn(`[Transcription Worker] No DEFAULT_OPENAI_API_KEY configured`)
    return { messageId, transcription: null, reason: 'no_api_key' }
  }

  if (!instanceApiUrl || !instanceApiKey || !messageKey) {
    console.warn(`[Transcription Worker] Missing UazAPI credentials for message ${messageId}`)
    return { messageId, transcription: null, reason: 'missing_instance' }
  }

  const transcription = await transcribeViaUazAPI(messageKey, instanceApiKey, instanceApiUrl, openAiKey)

  if (transcription) {
    console.log(`[Transcription Worker] Transcription: "${transcription.substring(0, 100)}"`)

    // Update message with transcription
    await prisma.message.update({
      where: { id: messageId },
      data: {
        messageText: transcription,
        metadata: {
          transcribed: true,
          transcription_source: 'uazapi',
          transcribed_at: new Date().toISOString(),
        },
      },
    })

    // Send to N8N with transcription as conteudo (single request, not a re-send)
    if (n8nWebhookUrl && n8nPayload) {
      await enqueueN8NWebhook({
        webhookUrl: n8nWebhookUrl,
        payload: {
          ...n8nPayload,
          conteudo: transcription,
          tipo_mensagem: 'audio',
        },
        companyId,
        conversationId,
        messageId,
      })
      console.log(`[Transcription Worker] Sent N8N webhook with transcribed audio`)
    }
  } else {
    console.error(`[Transcription Worker] Transcription failed for message ${messageId}`)

    // Update message to indicate failed transcription
    await prisma.message.update({
      where: { id: messageId },
      data: {
        messageText: '[Audio - transcricao falhou]',
        metadata: {
          transcribed: false,
          transcription_error: true,
          transcription_attempted_at: new Date().toISOString(),
        },
      },
    })
  }

  return { messageId, transcription: !!transcription }
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

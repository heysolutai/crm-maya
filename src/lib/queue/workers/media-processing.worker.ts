import { Worker, Job } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type MediaProcessingJob, enqueueN8NWebhook } from '../queues'
import { prisma } from '@/lib/db'
import { uploadToB2, buildB2Key, MIME_TO_EXT } from '@/lib/storage'
import { prepararAudioParaWeb } from '@/lib/audio-transcode'
import { publishEvent } from '@/lib/realtime'

// Download media via UazAPI /message/download endpoint (only reliable method: WhatsApp URLs are encrypted)
async function downloadViaUazAPI(
  messageKey: string,
  apiKey: string,
  apiUrl: string
): Promise<{ buffer: Buffer; mimeType: string; fileName?: string } | null> {
  try {
    const url = `${apiUrl}/message/download`
    console.log(`[Media Worker] UazAPI download, id: ${messageKey}`)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': apiKey,
      },
      body: JSON.stringify({
        id: messageKey,
        return_base64: true,
        generate_mp3: false,
        // return_link TEM que ser true: a UAZapi nao devolve base64 de arquivo
        // grande (documento, video); sem o link a resposta voltava vazia e a
        // midia ficava sem arquivo pra sempre.
        return_link: true,
        transcribe: false,
        download_quoted: false,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Media Worker] UazAPI download failed (${response.status}):`, errorText)
      return null
    }

    const result = await response.json()
    console.log(`[Media Worker] UazAPI response keys: ${Object.keys(result).join(', ')}`)

    // UazAPI pode retornar base64 em diferentes campos
    const rawBase64 = result.base64Data || result.base64 || result.data || result.file || result.content
    const mimeType = result.mimetype || result.mimeType || result.mime_type || 'application/octet-stream'
    const fileName = result.fileName || result.filename || result.title || result.name || undefined

    if (rawBase64 && rawBase64.length > 10) {
      // Strip data URI prefix if present
      let cleanBase64 = rawBase64
      const commaIdx = cleanBase64.indexOf(',')
      if (commaIdx !== -1 && commaIdx < 100) cleanBase64 = cleanBase64.substring(commaIdx + 1)
      cleanBase64 = cleanBase64.replace(/[\s\r\n]/g, '')
      const buffer = Buffer.from(cleanBase64, 'base64')
      console.log(`[Media Worker] Base64 decoded: ${buffer.length} bytes, mime: ${mimeType}, fileName: ${fileName ?? '(none)'}`)
      return { buffer, mimeType, fileName }
    }

    // Fallback: se a UazAPI retornou um fileURL, baixar diretamente
    const fileUrl = result.fileURL || result.fileUrl || result.url || result.link
    if (fileUrl && typeof fileUrl === 'string' && fileUrl.startsWith('http')) {
      console.log(`[Media Worker] base64 vazio, tentando fileURL: ${fileUrl}`)
      const fileRes = await fetch(fileUrl)
      if (!fileRes.ok) {
        console.error(`[Media Worker] fileURL download failed (${fileRes.status})`)
        return null
      }
      const arrayBuf = await fileRes.arrayBuffer()
      const buffer = Buffer.from(arrayBuf)
      const fileMime = fileRes.headers.get('content-type') || mimeType
      console.log(`[Media Worker] fileURL downloaded: ${buffer.length} bytes, mime: ${fileMime}`)
      return { buffer, mimeType: fileMime.split(';')[0].trim(), fileName }
    }

    console.error('[Media Worker] UazAPI returned no base64 data:', Object.keys(result))
    return null
  } catch (err: any) {
    console.error('[Media Worker] UazAPI download exception:', err.message)
    return null
  }
}

// Detect actual image format from buffer magic bytes
function detectImageFormat(buffer: Buffer): string | null {
  if (buffer.length < 12) return null
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg'
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image/png'
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (buffer.toString('ascii', 0, 4) === 'GIF8') return 'image/gif'
  return null
}

// Upload buffer to Backblaze B2
async function uploadToStorage(
  buffer: Buffer,
  mediaType: string,
  companyId: string,
  conversationId: string,
  mimeType: string
): Promise<string | null> {
  try {
    const baseMime = mimeType.split(';')[0].trim()
    const ext = MIME_TO_EXT[baseMime] || baseMime.split('/')[1] || 'bin'
    const key = buildB2Key(mediaType, companyId, conversationId, ext)
    const publicUrl = await uploadToB2(buffer, key, baseMime)
    console.log(`[Media Worker] B2 upload success: ${publicUrl}`)
    return publicUrl
  } catch (error) {
    console.error('[Media Worker] B2 upload exception:', error)
    return null
  }
}

async function processMedia(job: Job<MediaProcessingJob>) {
  const {
    messageId, conversationId, companyId,
    mediaType, mimeType: jobMimeType,
    instanceApiUrl, instanceApiKey, messageKey,
    n8nWebhookUrl, n8nPayload,
  } = job.data

  console.log(`[Media Worker] Processing ${mediaType} for message ${messageId}, key: ${messageKey}`)

  // Download via UazAPI (only reliable method: WhatsApp URLs are encrypted)
  const mediaData = await downloadViaUazAPI(messageKey, instanceApiKey, instanceApiUrl)

  if (!mediaData || mediaData.buffer.length === 0) {
    throw new Error(`Failed to download media for message ${messageId} (key: ${messageKey})`)
  }

  // Detect real format from magic bytes (UazAPI mimeType is often wrong)
  if (mediaType === 'image' || mediaType === 'sticker') {
    const detected = detectImageFormat(mediaData.buffer)
    if (detected) {
      console.log(`[Media Worker] Magic bytes: ${detected} (UazAPI said: ${mediaData.mimeType})`)
      mediaData.mimeType = detected
    }
  }

  // Fallback for non-image types or undetected formats
  if (mediaData.mimeType === 'application/octet-stream') {
    if (jobMimeType && jobMimeType !== 'application/octet-stream') {
      mediaData.mimeType = jobMimeType
    } else {
      const defaults: Record<string, string> = {
        image: 'image/jpeg', video: 'video/mp4', audio: 'audio/ogg',
        sticker: 'image/webp', document: 'application/pdf',
      }
      mediaData.mimeType = defaults[mediaType] || 'application/octet-stream'
    }
    console.log(`[Media Worker] Final mimeType: ${mediaData.mimeType}`)
  }

  // Nota de voz chega como OGG/Opus, que Safari e iPhone nao tocam. O que fica
  // guardado pra tela e MP3; o original so importa pro WhatsApp, que ja o tem.
  let mimeOriginal: string | undefined
  if (mediaType === 'audio') {
    const web = await prepararAudioParaWeb(mediaData.buffer, mediaData.mimeType)
    if (web.erro) console.warn(`[Media Worker] audio ${messageId} segue sem conversao: ${web.erro}`)
    mediaData.buffer = web.buffer
    mediaData.mimeType = web.mime
    mimeOriginal = web.mimeOriginal
  }

  console.log(`[Media Worker] Ready to upload: ${mediaType}, ${mediaData.mimeType}, ${mediaData.buffer.length} bytes`)

  // Upload to local filesystem
  const storagePath = await uploadToStorage(
    mediaData.buffer, mediaType, companyId, conversationId, mediaData.mimeType
  )

  if (!storagePath) {
    throw new Error(`Failed to upload media to storage for message ${messageId}`)
  }

  // Metadata e sempre reescrito: uma tentativa anterior pode ter deixado o
  // marcador de falha, que precisa sumir junto com o problema.
  const existing = await prisma.message.findFirst({
    where: { id: messageId, conversationId, conversation: { companyId } },
    select: { metadata: true },
  })
  if (!existing) throw new Error(`mensagem ${messageId} nao pertence ao job`)
  const prevMeta = (existing.metadata as Record<string, unknown> | null) || {}
  const enriched: Record<string, unknown> = { ...prevMeta, mimeType: mediaData.mimeType }
  if (mediaType === 'document') {
    if (!enriched.docName && mediaData.fileName) enriched.docName = mediaData.fileName
    if (!enriched.fileSize) enriched.fileSize = mediaData.buffer.length
  }
  if (mimeOriginal) enriched.original_mime = mimeOriginal
  delete enriched.media_error
  delete enriched.media_failed_at
  delete enriched.media_attempts

  await prisma.message.update({
    where: { id: messageId },
    data: { mediaUrl: storagePath, metadata: enriched as object },
  })

  console.log(`[Media Worker] Uploaded to: ${storagePath}`)

  // Sem isto a bolha ficava em "recuperando..." ate recarregar a pagina.
  await publishEvent(companyId, {
    type: 'message:update',
    conversationId,
    messageId,
    patch: { media_url: storagePath, metadata: enriched },
  }).catch((e) => console.error('[Media Worker] publish falhou:', (e as Error).message))

  // Send N8N webhook with public URL (B2 URL já é pública)
  if (n8nWebhookUrl && n8nPayload) {
    await enqueueN8NWebhook({
      webhookUrl: n8nWebhookUrl,
      payload: {
        ...n8nPayload,
        media_url: storagePath, // storagePath agora é a URL pública do B2
      },
      companyId,
      conversationId,
      messageId,
    })
    console.log(`[Media Worker] N8N webhook media_url: ${storagePath}`)
  }

  return { messageId, storagePath }
}

/**
 * Ultima tentativa falhou: grava o motivo na mensagem, senao a bolha diz
 * "recuperando..." pra sempre e ninguem sabe por que.
 */
async function registrarFalhaTerminal(job: Job<MediaProcessingJob> | undefined, err: Error) {
  if (!job) return
  const maximo = job.opts?.attempts ?? 1
  if (job.attemptsMade < maximo) return
  const { messageId, conversationId, companyId } = job.data
  if (!messageId || !companyId) return
  try {
    const atual = await prisma.message.findFirst({
      where: { id: messageId, conversation: { companyId } },
      select: { metadata: true, mediaUrl: true },
    })
    if (!atual || atual.mediaUrl) return
    const metadata: Record<string, unknown> = {
      ...((atual.metadata as Record<string, unknown> | null) || {}),
      media_error: err.message.slice(0, 300),
      media_failed_at: new Date().toISOString(),
      media_attempts: job.attemptsMade,
    }
    await prisma.message.update({ where: { id: messageId }, data: { metadata: metadata as object } })
    await publishEvent(companyId, {
      type: 'message:update',
      conversationId,
      messageId,
      patch: { metadata },
    }).catch(() => {})
  } catch (e) {
    console.error('[Media Worker] nao consegui registrar a falha na mensagem:', (e as Error).message)
  }
}

let worker: Worker<MediaProcessingJob> | null = null

export function startMediaProcessingWorker() {
  if (worker) return worker

  worker = new Worker<MediaProcessingJob>(
    QUEUE_NAMES.MEDIA_PROCESSING,
    processMedia,
    {
      connection: getRedisConnection(),
      concurrency: 5,
    }
  )

  worker.on('completed', (job) => {
    console.log(`[Media Worker] Job ${job.id} completed`)
  })

  worker.on('failed', (job, err) => {
    console.error(`[Media Worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message)
    void registrarFalhaTerminal(job, err)
  })

  console.log('[Media Worker] Started')
  return worker
}

export function stopMediaProcessingWorker() {
  if (worker) {
    worker.close()
    worker = null
  }
}

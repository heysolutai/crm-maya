import { Worker, Job } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type MediaProcessingJob, enqueueN8NWebhook } from '../queues'
import { prisma } from '@/lib/db'
import fs from 'fs'
import path from 'path'

// Download media via UazAPI /message/download endpoint (only reliable method — WhatsApp URLs are encrypted)
async function downloadViaUazAPI(
  messageKey: string,
  apiKey: string,
  apiUrl: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
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
        return_link: false,
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

    const base64Data = result.base64 || result.data
    if (!base64Data) {
      console.error('[Media Worker] UazAPI returned no base64 data:', Object.keys(result))
      return null
    }

    // Strip data URI prefix if present (e.g. "data:image/jpeg;base64,...")
    let cleanBase64 = base64Data
    const commaIdx = cleanBase64.indexOf(',')
    if (commaIdx !== -1 && commaIdx < 100) {
      cleanBase64 = cleanBase64.substring(commaIdx + 1)
    }
    // Remove any whitespace/newlines
    cleanBase64 = cleanBase64.replace(/[\s\r\n]/g, '')

    const buffer = Buffer.from(cleanBase64, 'base64')
    const mimeType = result.mimetype || result.mimeType || 'application/octet-stream'
    console.log(`[Media Worker] Base64 decoded: ${buffer.length} bytes, mime: ${mimeType}, first bytes: ${buffer.slice(0, 8).toString('hex')}`)

    return { buffer, mimeType }
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

// Upload buffer to local filesystem (public/uploads/)
async function uploadToStorage(
  buffer: Buffer,
  mediaType: string,
  companyId: string,
  conversationId: string,
  mimeType: string
): Promise<string | null> {
  try {
    const baseMime = mimeType.split(';')[0].trim()

    const extensions: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
      'video/mp4': 'mp4', 'video/3gpp': '3gp',
      'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a',
      'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    }
    const ext = extensions[baseMime] || baseMime.split('/')[1] || 'bin'
    const fileName = `${mediaType}_${conversationId}_${Date.now()}.${ext}`
    const storagePath = `uploads/conversation-media/${mediaType}s/${companyId}/${fileName}`
    const fullPath = path.join(process.cwd(), 'public', storagePath)

    // Ensure directory exists
    const dir = path.dirname(fullPath)
    await fs.promises.mkdir(dir, { recursive: true })

    console.log(`[Media Worker] Uploading ${storagePath} (${buffer.length} bytes, type: ${baseMime})`)

    await fs.promises.writeFile(fullPath, buffer)

    return storagePath
  } catch (error) {
    console.error('[Media Worker] Upload exception:', error)
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

  // Download via UazAPI (only reliable method — WhatsApp URLs are encrypted)
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

  console.log(`[Media Worker] Ready to upload: ${mediaType}, ${mediaData.mimeType}, ${mediaData.buffer.length} bytes`)

  // Upload to local filesystem
  const storagePath = await uploadToStorage(
    mediaData.buffer, mediaType, companyId, conversationId, mediaData.mimeType
  )

  if (!storagePath) {
    throw new Error(`Failed to upload media to storage for message ${messageId}`)
  }

  // Update message with storage path
  await prisma.message.update({
    where: { id: messageId },
    data: { mediaUrl: storagePath },
  })

  console.log(`[Media Worker] Uploaded to: ${storagePath}`)

  // Send N8N webhook with public URL
  if (n8nWebhookUrl && n8nPayload) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const publicUrl = `${baseUrl}/${storagePath}`

    await enqueueN8NWebhook({
      webhookUrl: n8nWebhookUrl,
      payload: {
        ...n8nPayload,
        media_url: publicUrl,
      },
      companyId,
      conversationId,
      messageId,
    })
    console.log(`[Media Worker] N8N webhook URL: ${publicUrl}`)
  }

  return { messageId, storagePath }
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

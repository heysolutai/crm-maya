import { Worker, Job } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type OutboundMessageJob, type OutboundMediaJob } from '../queues'
import { prisma } from '@/lib/db'

async function processOutboundMessage(job: Job<OutboundMessageJob>) {
  const {
    companyId, instanceId, phone, text,
    conversationId, messageId, fromAI, replyToMessageId, metadata,
  } = job.data

  console.log(`[Outbound Worker] Sending text to ${phone} (company: ${companyId})`)

  // Get WhatsApp instance
  const instance = await prisma.whatsappInstance.findFirst({
    where: { id: instanceId },
    select: { apiUrl: true, instanceApiKey: true },
  })

  if (!instance) {
    throw new Error(`WhatsApp instance not found: ${instanceId}`)
  }

  // Build request body
  const body: Record<string, unknown> = {
    number: phone,
    text: text,
  }

  if (replyToMessageId) {
    body.quoted = { messageid: replyToMessageId }
  }

  // Send via WhatsApp API
  const response = await fetch(`${instance.apiUrl}/send/text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'token': instance.instanceApiKey || '',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`WhatsApp API error (${response.status}): ${errorText}`)
  }

  const result = await response.json()
  console.log(`[Outbound Worker] Message sent to ${phone}, WAid: ${result?.key?.id || 'unknown'}`)

  // If we need to save the message to DB (e.g., follow-up, reminder)
  if (conversationId && !messageId) {
    await prisma.message.create({
      data: {
        conversationId: conversationId,
        senderType: fromAI ? 'ai' : 'agent',
        messageText: text,
        messageType: 'text',
        metadata: {
          ...metadata,
          sent_via_queue: true,
          wa_message_id: result?.key?.id,
        },
      },
    })
  }

  return { phone, waMessageId: result?.key?.id }
}

async function processOutboundMedia(job: Job<OutboundMediaJob>) {
  const {
    companyId, instanceId, phone, mediaUrl,
    mediaType, caption, fileName, conversationId,
  } = job.data

  console.log(`[Outbound Worker] Sending ${mediaType} to ${phone}`)

  const instance = await prisma.whatsappInstance.findFirst({
    where: { id: instanceId },
    select: { apiUrl: true, instanceApiKey: true },
  })

  if (!instance) {
    throw new Error(`WhatsApp instance not found: ${instanceId}`)
  }

  // Determine endpoint based on media type
  const endpoints: Record<string, string> = {
    image: '/send/image',
    video: '/send/video',
    audio: '/send/audio',
    document: '/send/document',
  }
  const endpoint = endpoints[mediaType] || '/send/document'

  const body: Record<string, unknown> = {
    number: phone,
    url: mediaUrl,
  }

  if (caption) body.caption = caption
  if (fileName) body.fileName = fileName

  const response = await fetch(`${instance.apiUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'token': instance.instanceApiKey || '',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`WhatsApp API error (${response.status}): ${errorText}`)
  }

  const result = await response.json()
  console.log(`[Outbound Worker] Media sent to ${phone}`)

  return { phone, waMessageId: result?.key?.id }
}

let textWorker: Worker<OutboundMessageJob> | null = null
let mediaWorker: Worker<OutboundMediaJob> | null = null

export function startOutboundMessageWorker() {
  if (!textWorker) {
    textWorker = new Worker<OutboundMessageJob>(
      QUEUE_NAMES.OUTBOUND_MESSAGE,
      processOutboundMessage,
      {
        connection: getRedisConnection(),
        concurrency: 3,
        limiter: {
          max: 30,
          duration: 60000, // Max 30 messages per minute (WhatsApp rate limit)
        },
      }
    )

    textWorker.on('completed', (job) => {
      console.log(`[Outbound Worker] Text job ${job.id} completed`)
    })

    textWorker.on('failed', (job, err) => {
      console.error(`[Outbound Worker] Text job ${job?.id} failed:`, err.message)
    })

    console.log('[Outbound Worker] Text worker started')
  }

  if (!mediaWorker) {
    mediaWorker = new Worker<OutboundMediaJob>(
      QUEUE_NAMES.OUTBOUND_MEDIA,
      processOutboundMedia,
      {
        connection: getRedisConnection(),
        concurrency: 2,
        limiter: {
          max: 15,
          duration: 60000, // Max 15 media per minute
        },
      }
    )

    mediaWorker.on('completed', (job) => {
      console.log(`[Outbound Worker] Media job ${job.id} completed`)
    })

    mediaWorker.on('failed', (job, err) => {
      console.error(`[Outbound Worker] Media job ${job?.id} failed:`, err.message)
    })

    console.log('[Outbound Worker] Media worker started')
  }

  return { textWorker, mediaWorker }
}

export function stopOutboundWorkers() {
  if (textWorker) {
    textWorker.close()
    textWorker = null
  }
  if (mediaWorker) {
    mediaWorker.close()
    mediaWorker = null
  }
}

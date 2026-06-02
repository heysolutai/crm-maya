import { Queue } from 'bullmq'
import { getRedisConnection } from './connection'

// ============================================================
// Job type definitions
// ============================================================

export interface N8NWebhookJob {
  webhookUrl: string
  payload: Record<string, unknown>
  companyId: string
  conversationId: string
  messageId: string
}

export interface TranscriptionJob {
  messageId: string
  conversationId: string
  companyId: string
  audioUrl: string // URL to download the audio
  instanceApiUrl: string
  instanceApiKey: string
  messageKey: string // UAZ message key for fallback methods
  n8nWebhookUrl?: string // To resend after transcription
  n8nPayload?: Record<string, unknown> // Original N8N payload to resend with transcription
}

export interface MediaProcessingJob {
  messageId: string
  conversationId: string
  companyId: string
  mediaUrl: string // Source URL (UAZapi)
  mediaType: 'image' | 'video' | 'document' | 'audio' | 'sticker'
  mimeType: string
  fileName?: string
  instanceApiUrl: string
  instanceApiKey: string
  messageKey: string
  n8nWebhookUrl?: string
  n8nPayload?: Record<string, unknown>
}

export interface OutboundMessageJob {
  companyId: string
  instanceId: string
  phone: string
  text: string
  conversationId?: string
  messageId?: string
  fromAI?: boolean
  replyToMessageId?: string
  metadata?: Record<string, unknown>
}

export interface OutboundMediaJob {
  companyId: string
  instanceId: string
  phone: string
  mediaUrl: string
  mediaType: 'image' | 'video' | 'document' | 'audio'
  caption?: string
  fileName?: string
  conversationId?: string
  messageId?: string
}

export interface InboundMessageJob {
  rawPayload: Record<string, unknown>
  receivedAt: string
  agentId?: string
}

// Campaign tick: o worker pega UM recipient pending da campanha, envia,
// e re-enfileira proximo tick com delay aleatorio entre min e max.
// Auto-pause se janela horaria fechou / limite diario batido / campanha pausada.
export interface CampaignTickJob {
  campaignId: string
}

// Cron job types (no payload — workers poll DB direto)
export interface CronTickJob {
  triggeredAt: string
}

// ============================================================
// Queue names
// ============================================================

export const QUEUE_NAMES = {
  INBOUND_MESSAGE: 'inbound-message',
  N8N_WEBHOOK: 'n8n-webhook',
  TRANSCRIPTION: 'audio-transcription',
  MEDIA_PROCESSING: 'media-processing',
  OUTBOUND_MESSAGE: 'outbound-message',
  OUTBOUND_MEDIA: 'outbound-media',
  CAMPAIGN_TICK: 'campaign-tick',
  CRON_REMINDERS: 'cron-reminders',
  CRON_FOLLOW_UPS: 'cron-follow-ups',
  CRON_WHATSAPP_STATUS: 'cron-whatsapp-status',
  CRON_CLEANUP_PRESENCE: 'cron-cleanup-presence',
} as const

// ============================================================
// Queue instances (lazy singletons)
// ============================================================

const queues = new Map<string, Queue>()

function getOrCreateQueue<T>(name: string): Queue<T> {
  if (!queues.has(name)) {
    const queue = new Queue<T>(name, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000, // 2s → 4s → 8s
        },
        removeOnComplete: {
          age: 24 * 3600, // Keep completed jobs for 24h
          count: 1000,
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        },
      },
    })
    queues.set(name, queue)
  }
  return queues.get(name)! as Queue<T>
}

export function getInboundMessageQueue() {
  return getOrCreateQueue<InboundMessageJob>(QUEUE_NAMES.INBOUND_MESSAGE)
}

export function getN8NQueue() {
  return getOrCreateQueue<N8NWebhookJob>(QUEUE_NAMES.N8N_WEBHOOK)
}

export function getTranscriptionQueue() {
  return getOrCreateQueue<TranscriptionJob>(QUEUE_NAMES.TRANSCRIPTION)
}

export function getMediaQueue() {
  return getOrCreateQueue<MediaProcessingJob>(QUEUE_NAMES.MEDIA_PROCESSING)
}

export function getOutboundMessageQueue() {
  return getOrCreateQueue<OutboundMessageJob>(QUEUE_NAMES.OUTBOUND_MESSAGE)
}

export function getOutboundMediaQueue() {
  return getOrCreateQueue<OutboundMediaJob>(QUEUE_NAMES.OUTBOUND_MEDIA)
}

export function getCampaignTickQueue() {
  return getOrCreateQueue<CampaignTickJob>(QUEUE_NAMES.CAMPAIGN_TICK)
}

// ============================================================
// Helper to add jobs with proper defaults per queue
// ============================================================

export async function enqueueInboundMessage(data: InboundMessageJob) {
  const queue = getInboundMessageQueue()
  return queue.add('process-inbound', data, {
    priority: 0, // Highest priority — incoming messages
  })
}

export async function enqueueN8NWebhook(data: N8NWebhookJob) {
  const queue = getN8NQueue()
  return queue.add('webhook-call', data, {
    priority: 1, // High priority
  })
}

export async function enqueueTranscription(data: TranscriptionJob) {
  const queue = getTranscriptionQueue()
  return queue.add('transcribe', data, {
    priority: 2,
    attempts: 4, // More retries for transcription (flaky external API)
  })
}

export async function enqueueMediaProcessing(data: MediaProcessingJob) {
  const queue = getMediaQueue()
  return queue.add('process-media', data, {
    priority: 3,
  })
}

export async function enqueueOutboundMessage(data: OutboundMessageJob) {
  const queue = getOutboundMessageQueue()
  return queue.add('send-text', data, {
    priority: 1,
  })
}

export async function enqueueOutboundMedia(data: OutboundMediaJob) {
  const queue = getOutboundMediaQueue()
  return queue.add('send-media', data, {
    priority: 2,
  })
}

/**
 * Agenda o proximo tick de uma campanha. delayMs=0 roda imediato.
 * Idempotente: usa jobId = `campaign:${campaignId}` pra garantir que so existe
 * UM tick agendado por campanha. Re-chamadas substituem o anterior.
 */
export async function enqueueCampaignTick(
  data: CampaignTickJob,
  delayMs = 0
) {
  const queue = getCampaignTickQueue()
  const jobId = `campaign:${data.campaignId}`
  // Remove tick anterior se houver — evita corrida em pause/resume/cancel
  try {
    const existing = await queue.getJob(jobId)
    if (existing) await existing.remove()
  } catch {
    // noop
  }
  return queue.add('tick', data, {
    jobId,
    delay: delayMs,
    priority: 5, // baixa prioridade — campanhas nao devem competir com mensagens entrando
    attempts: 2,
  })
}

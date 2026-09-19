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
  /** Job passou pela espera de agrupamento: so ai o worker pode juntar mensagens. */
  agrupar?: boolean
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
}

export interface EmailJob {
  para: string | string[]
  assunto: string
  html: string
  texto: string
  /** So pra log: 'recuperacao' | 'convite' | 'relatorio' | 'teste'. */
  tipo?: string
}

// Cron job types (no payload: workers poll Supabase directly)
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
  EMAIL: 'email',
  CRON_REMINDERS: 'cron-reminders',
  CRON_REVIEW_REPORT: 'cron-review-report',
  CRON_FOLLOW_UPS: 'cron-follow-ups',
  CRON_WHATSAPP_STATUS: 'cron-whatsapp-status',
  CRON_CLEANUP_PRESENCE: 'cron-cleanup-presence',
  CRON_REVIEW_DISPATCH: 'cron-review-dispatch',
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

export function getEmailQueue() {
  return getOrCreateQueue<EmailJob>(QUEUE_NAMES.EMAIL)
}

// ============================================================
// Helper to add jobs with proper defaults per queue
// ============================================================

export async function enqueueInboundMessage(data: InboundMessageJob) {
  const queue = getInboundMessageQueue()
  return queue.add('process-inbound', data, {
    priority: 0, // Highest priority: incoming messages
  })
}

/**
 * Espera antes de chamar o N8N, pra juntar mensagem picada.
 *
 * Cliente costuma escrever em varias mensagens curtas ("Nao", "sei", "te",
 * "dizer"). Chamando o fluxo a cada uma, a IA responde a pedacos soltos e o
 * atendimento fica sem sentido. Com a espera, cada mensagem nova REINICIA a
 * contagem e o fluxo e chamado uma vez so, com o texto inteiro.
 *
 * Zero desliga o agrupamento. Ajustavel por ambiente sem rebuild.
 */
export const N8N_DEBOUNCE_MS = Math.max(
  0,
  parseInt(process.env.N8N_DEBOUNCE_MS || '10000', 10) || 0
)

export async function enqueueN8NWebhook(
  data: N8NWebhookJob,
  opts?: { debounceMs?: number }
) {
  const queue = getN8NQueue()
  const espera = opts?.debounceMs ?? 0

  if (espera <= 0) {
    return queue.add('webhook-call', data, { priority: 1 })
  }

  // Ponteiro no Redis com o job que ainda esta esperando nesta conversa.
  //
  // Nao da pra usar um jobId fixo por conversa: o BullMQ guarda o job
  // concluido (removeOnComplete) e IGNORA EM SILENCIO qualquer add com um
  // jobId que ja existe. A conversa ficaria sem resposta ate o job velho
  // sumir sozinho. Entao cada espera ganha um id proprio, e o ponteiro diz
  // qual cancelar quando chega mensagem nova.
  const redis = getRedisConnection()
  const ponteiro = `n8n:debounce:${data.conversationId}`

  const anteriorId = await redis.get(ponteiro).catch(() => null)
  if (anteriorId) {
    const anterior = await queue.getJob(anteriorId).catch(() => null)
    const estado = anterior ? await anterior.getState().catch(() => 'unknown') : null
    // Em andamento nao se mexe: ja esta indo pro fluxo, e o job novo cuida do
    // que sobrar. So o que ainda nao comecou e removido, pra contagem
    // recomecar do ULTIMO pedaco e nao do primeiro.
    if (anterior && (estado === 'delayed' || estado === 'waiting' || estado === 'prioritized')) {
      await anterior.remove().catch(() => {})
    }
  }

  // Sufixo aleatorio junto do tempo: duas mensagens no mesmo milissegundo
  // gerariam o mesmo id, e a segunda seria engolida pelo BullMQ.
  const jobId = `n8n-conv-${data.conversationId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const job = await queue.add(
    'webhook-call',
    // So quem esperou pode juntar mensagem. Sem essa marca o worker
    // reescreveria tambem o payload de mensagem enviada pelo atendente.
    { ...data, agrupar: true },
    { priority: 1, delay: espera, jobId }
  )

  // TTL com folga sobre a espera: o ponteiro so serve pra cancelar enquanto o
  // job esta parado; depois disso pode sumir.
  await redis.set(ponteiro, jobId, 'PX', espera + 60_000).catch(() => {})
  return job
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
    // Provedor/B2 instaveis por instantes nao podem virar midia perdida:
    // 5 tentativas com backoff exponencial (30s, 1m, 2m, 4m, 8m).
    attempts: 5,
    backoff: { type: 'exponential', delay: 30_000 },
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
 * Poe um e-mail na fila.
 *
 * Nunca mande e-mail direto no meio de uma rota: servidor SMTP demora e cai, e
 * a pessoa ficaria esperando o "Enviar" da tela por causa disso. Aqui a rota
 * responde na hora e a fila cuida do resto, com mais tentativas que as outras
 * filas porque recusa temporaria (greylisting, limite por minuto) e comum.
 */
export async function enqueueEmail(data: EmailJob) {
  const queue = getEmailQueue()
  return queue.add('send-email', data, {
    priority: 3,
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 }, // 5s → 10s → 20s → 40s
  })
}

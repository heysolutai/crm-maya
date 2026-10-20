import { prisma } from '@/lib/db'
import { publishEvent } from '@/lib/realtime'
import { logConversationEvent, type ConversationEventActor } from '@/lib/conversations/events'

/**
 * Pausa da IA por cliente (clients.ai_paused + ai_paused_until).
 *
 * A pausa expira SOZINHA na leitura: quem decide se a IA responde usa
 * isAiPausedNow(), que trata ai_paused_until vencido como ativo. Por isso nao
 * existe cron de "despausar"; o booleano fica true no banco ate a proxima
 * pausa/retomada, e tudo bem.
 */

/** Padrao quando a empresa nao configurou `settings.ai_pause_minutes`. */
export const DEFAULT_AI_PAUSE_MINUTES = 30

export interface AiPauseState {
  aiPaused: boolean
  aiPausedUntil: Date | string | null
}

export function isAiPausedNow(state: AiPauseState | null | undefined, now: Date = new Date()): boolean {
  if (!state?.aiPaused) return false
  if (!state.aiPausedUntil) return true // pausa sem prazo
  return new Date(state.aiPausedUntil).getTime() > now.getTime()
}

/** Minutos de pausa padrao da empresa. 0 = sem prazo (so volta manual). */
export async function getAiPauseMinutes(companyId: string): Promise<number> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { settings: true },
  })
  const settings = (company?.settings ?? {}) as Record<string, unknown>
  const value = Number(settings.ai_pause_minutes)
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_AI_PAUSE_MINUTES
}

export interface PauseClientAIInput {
  companyId: string
  clientId: string
  conversationId?: string | null
  actor: ConversationEventActor
  userId?: string | null
  /**
   * undefined = padrao da empresa. null ou 0 = sem prazo.
   */
  minutes?: number | null
  /**
   * true = pausa disparada por mensagem do atendente (CRM ou celular).
   * Nesse caso nao encurta uma pausa maior que ja esteja valendo: se o
   * atendente pausou "ate eu retomar", responder a conversa nao pode virar
   * isso numa pausa de 30 min.
   */
  automatic?: boolean
}

export interface PauseResult {
  paused: boolean
  until: Date | null
}

export async function pauseClientAI(input: PauseClientAIInput): Promise<PauseResult> {
  const client = await prisma.client.findFirst({
    where: { id: input.clientId, companyId: input.companyId },
    select: { aiPaused: true, aiPausedUntil: true },
  })
  if (!client) return { paused: false, until: null }

  const now = new Date()
  const minutes = input.minutes === undefined ? await getAiPauseMinutes(input.companyId) : input.minutes
  let until: Date | null = minutes && minutes > 0 ? new Date(now.getTime() + minutes * 60_000) : null

  const wasPaused = isAiPausedNow(client, now)
  if (input.automatic && wasPaused) {
    // Pausa sem prazo ja valendo: mantem.
    if (!client.aiPausedUntil) return { paused: true, until: null }
    // Pausa com prazo maior que o novo: mantem o maior.
    const current = new Date(client.aiPausedUntil)
    if (until && current.getTime() > until.getTime()) until = current
  }

  await prisma.client.updateMany({
    where: { id: input.clientId, companyId: input.companyId },
    data: {
      aiPaused: true,
      aiPausedUntil: until,
      // Mantem o inicio original enquanto a pausa so e estendida.
      ...(wasPaused ? {} : { aiPausedAt: now }),
      aiPausedBy: input.userId ?? input.actor,
    },
  })

  // Evento so na transicao ativo -> pausado: cada mensagem do atendente
  // estende a pausa, e logar todas encheria a tabela sem informacao nova.
  if (!wasPaused) {
    await logConversationEvent({
      companyId: input.companyId,
      conversationId: input.conversationId,
      type: 'ai_paused',
      actor: input.actor,
      userId: input.userId,
      metadata: { until: until ? until.toISOString() : null },
    })
  }

  if (input.conversationId) {
    await publishEvent(input.companyId, { type: 'conversation:update', conversationId: input.conversationId })
  }

  return { paused: true, until }
}

export interface ResumeClientAIInput {
  companyId: string
  clientId: string
  conversationId?: string | null
  actor: ConversationEventActor
  userId?: string | null
}

export async function resumeClientAI(input: ResumeClientAIInput): Promise<boolean> {
  const result = await prisma.client.updateMany({
    where: { id: input.clientId, companyId: input.companyId },
    data: { aiPaused: false, aiPausedUntil: null, aiPausedAt: null, aiPausedBy: null },
  })
  if (result.count === 0) return false

  await logConversationEvent({
    companyId: input.companyId,
    conversationId: input.conversationId,
    type: 'ai_resumed',
    actor: input.actor,
    userId: input.userId,
  })

  if (input.conversationId) {
    await publishEvent(input.companyId, { type: 'conversation:update', conversationId: input.conversationId })
  }
  return true
}

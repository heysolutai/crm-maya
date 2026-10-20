import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

/**
 * Linha do tempo de fatos da conversa (tabela conversation_events).
 *
 * So insere. Os campos da Conversation (transferredTo, departmentId, tags)
 * guardam o estado ATUAL e sao sobrescritos; pra contar "quantos
 * encaminhamentos pra humano no dia X" precisa do fato registrado na hora.
 */
export type ConversationEventType =
  | 'handoff_human'
  | 'handoff_event'
  | 'ai_paused'
  | 'ai_resumed'

export type ConversationEventActor = 'ai' | 'agent' | 'phone' | 'system'

export interface LogConversationEventInput {
  companyId: string
  conversationId?: string | null
  type: ConversationEventType
  actor: ConversationEventActor
  userId?: string | null
  departmentId?: string | null
  metadata?: Record<string, string | number | boolean | null>
}

/**
 * Grava um evento. Nunca lanca: metrica nao pode derrubar o fluxo principal
 * (transferencia, envio de mensagem). Falha vai so pro log.
 */
export async function logConversationEvent(input: LogConversationEventInput): Promise<void> {
  try {
    await prisma.conversationEvent.create({
      data: {
        companyId: input.companyId,
        conversationId: input.conversationId ?? null,
        type: input.type,
        actor: input.actor,
        userId: input.userId ?? null,
        departmentId: input.departmentId ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    })
  } catch (error) {
    console.error('[ConversationEvent] falhou ao gravar', input.type, error)
  }
}

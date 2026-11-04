import { prisma } from '@/lib/db'
import { resolveOpenAiKey } from '@/lib/ai/embeddings'
import { comoRecord } from './config'

/**
 * Qual AiAgent atende uma conversa. Mesma regra do webhook do WhatsApp (secao
 * "AI config agora e POR INBOX"):
 *   - a inbox da conversa tem agente (Inbox.aiAgentId) -> esse agente;
 *   - senao -> o primeiro agente ATIVO do restaurante (compatibilidade com
 *     fluxo antigo).
 *
 * Diferenca de proposito: aqui o agente vinculado volta mesmo DESLIGADO, pra o
 * engine explicar "agente desligado" em vez de "sem agente". Quem decide por
 * isActive e o chamador.
 */

export interface AgenteIA {
  id: string
  companyId: string
  name: string | null
  engine: string
  isActive: boolean
  /** IA ligada so para este telefone (teste). null = para todos. */
  onlyPhone: string | null
  /** 'function_calls', 'mcp' ou 'none': quais ferramentas valem neste WhatsApp. */
  toolMode: string
  prompts: unknown
  behaviorSettings: unknown
  apiKeys: unknown
}

const SELECT_AGENTE = {
  id: true,
  companyId: true,
  name: true,
  engine: true,
  isActive: true,
  onlyPhone: true,
  toolMode: true,
  prompts: true,
  behaviorSettings: true,
  apiKeys: true,
} as const

export async function resolverAgenteDaConversa(
  companyId: string,
  conversationId: string
): Promise<AgenteIA | null> {
  const conversa = await prisma.conversation.findFirst({
    where: { id: conversationId, companyId },
    select: { inbox: { select: { aiAgentId: true } } },
  })
  if (!conversa) return null
  return resolverAgenteDaInbox(companyId, conversa.inbox?.aiAgentId ?? null)
}

/** Mesma regra, quando quem chama ja tem o aiAgentId da inbox na mao. */
export async function resolverAgenteDaInbox(
  companyId: string,
  aiAgentId: string | null
): Promise<AgenteIA | null> {
  if (aiAgentId) {
    return prisma.aiAgent.findFirst({ where: { id: aiAgentId, companyId }, select: SELECT_AGENTE })
  }
  return prisma.aiAgent.findFirst({
    where: { companyId, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: SELECT_AGENTE,
  })
}

/**
 * Chave da OpenAI do turno: a do proprio agente (AiAgent.apiKeys.openai); senao
 * a padrao (chave do restaurante / padrao do sistema, via resolveOpenAiKey).
 * Nunca logada.
 */
export async function resolverChaveOpenAI(agente: Pick<AgenteIA, 'apiKeys'>, companyId: string): Promise<string | null> {
  const doAgente = comoRecord(agente.apiKeys).openai
  if (typeof doAgente === 'string' && doAgente.trim()) return doAgente.trim()
  return resolveOpenAiKey(companyId)
}

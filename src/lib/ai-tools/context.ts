import { prisma } from '@/lib/db'
import type { ToolContext } from './types'

/**
 * Contexto da conversa pras ferramentas. Tudo aqui vem do CRM, nunca da IA:
 * e assim que um restaurante nao consegue (nem enganando a IA) consultar ou
 * criar reserva em nome de outro.
 */

const TZ = 'America/Sao_Paulo'

function dataLocal(d: Date): string {
  // en-CA formata AAAA-MM-DD.
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}

export function agoraSaoPaulo(now: Date = new Date()): ToolContext['agora'] {
  return {
    data: dataLocal(now),
    hora: now.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }),
    amanha: dataLocal(new Date(now.getTime() + 24 * 60 * 60 * 1000)),
    iso: now.toISOString(),
  }
}

function restaurantIdOf(channelConfig: unknown): string {
  if (!channelConfig || typeof channelConfig !== 'object') return ''
  const v = (channelConfig as Record<string, unknown>).restaurantId
  return typeof v === 'string' ? v : ''
}

/**
 * Contexto de uma conversa do restaurante. Retorna null se a conversa nao e
 * dele (IDOR).
 */
export async function buildConversationContext(
  companyId: string,
  conversationId: string,
  config: Record<string, string> = {}
): Promise<ToolContext | null> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, companyId },
    select: {
      id: true,
      friendlyId: true,
      company: { select: { id: true, name: true, tradeName: true } },
      client: { select: { id: true, firstName: true, lastName: true, fullName: true, phone: true } },
      inbox: {
        select: {
          id: true,
          displayName: true,
          instanceName: true,
          channelConfig: true,
          aiAgent: { select: { knowledge: true } },
        },
      },
    },
  })
  if (!conversation) return null

  const c = conversation.client
  const nome = c ? (c.fullName || `${c.firstName} ${c.lastName || ''}`).trim() : ''

  // Conhecimento: o agente da inbox; senao o primeiro agente ativo.
  let knowledge = conversation.inbox?.aiAgent?.knowledge ?? null
  if (!knowledge) {
    const agente = await prisma.aiAgent.findFirst({
      where: { companyId, isActive: true, knowledge: { not: null } },
      select: { knowledge: true },
    })
    knowledge = agente?.knowledge ?? null
  }

  return {
    empresa: {
      id: conversation.company.id,
      nome: conversation.company.tradeName || conversation.company.name,
    },
    conversa: { id: conversation.id, codigo: conversation.friendlyId },
    cliente: { id: c?.id ?? null, nome, telefone: (c?.phone || '').replace(/\D/g, '') },
    inbox: {
      id: conversation.inbox?.id ?? null,
      nome: conversation.inbox?.displayName || conversation.inbox?.instanceName || '',
      restaurant_id: restaurantIdOf(conversation.inbox?.channelConfig),
    },
    config,
    agora: agoraSaoPaulo(),
    knowledge,
  }
}

/**
 * Contexto de TESTE (botao "Testar"), sem conversa: usa a primeira inbox do
 * restaurante que tem ID de restaurante, e um cliente ficticio.
 */
export async function buildTestContext(
  companyId: string,
  config: Record<string, string> = {},
  /** Numero escolhido pra testar (precisa ser do restaurante). Omitido = o primeiro com ID preenchido. */
  inboxId?: string | null,
  /** Cliente do teste ("Testar a IA"): nome/telefone que vao pro sistema externo. */
  cliente?: { nome?: string | null; telefone?: string | null } | null
): Promise<ToolContext> {
  const [company, inbox, agente] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, tradeName: true } }),
    prisma.inbox.findMany({
      where: { companyId, isActive: true },
      select: { id: true, displayName: true, instanceName: true, channelConfig: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.aiAgent.findFirst({
      where: { companyId, isActive: true, knowledge: { not: null } },
      select: { knowledge: true },
    }),
  ])
  const comId = inboxId
    ? inbox.find((i) => i.id === inboxId)
    : (inbox.find((i) => restaurantIdOf(i.channelConfig)) ?? inbox[0])

  return {
    empresa: { id: companyId, nome: company?.tradeName || company?.name || '' },
    conversa: { id: null, codigo: null },
    cliente: {
      id: null,
      nome: cliente?.nome?.trim() || 'Cliente Teste',
      telefone: cliente?.telefone?.replace(/\D/g, '') || '5500000000000',
    },
    inbox: {
      id: comId?.id ?? null,
      nome: comId?.displayName || comId?.instanceName || '',
      restaurant_id: restaurantIdOf(comId?.channelConfig),
    },
    config,
    agora: agoraSaoPaulo(),
    knowledge: agente?.knowledge ?? null,
  }
}

/** Nome amigavel de uma variavel de contexto que faltou (mensagem de erro). */
export function rotuloVariavel(path: string): string {
  const fixos: Record<string, string> = {
    'inbox.restaurant_id': 'ID do restaurante na caixa de entrada (Configurações da conexão)',
    'cliente.telefone': 'telefone do cliente',
    'cliente.nome': 'nome do cliente',
    'conversa.id': 'conversa',
  }
  if (fixos[path]) return fixos[path]
  if (path.startsWith('config.')) return `campo "${path.slice(7)}" da integração`
  return path
}

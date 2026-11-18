import { z } from 'zod'
import type { HandoffRequest, HandoffRule, Prisma } from '@prisma/client'

/** Campos editaveis de uma regra (criar e editar usam os mesmos limites). */
export const camposDaRegra = {
  name: z.string().trim().min(2, 'Dê um nome à regra').max(60),
  tag: z.string().trim().min(2, 'Informe a etiqueta').max(60),
  trigger: z.string().trim().min(10, 'Explique quando a IA deve usar esta regra').max(1000),
  notWhen: z.string().trim().max(1000),
  examples: z.array(z.string().trim().min(1).max(200)).max(10),
  collectFields: z.array(z.string().trim().min(1).max(60)).max(8),
  askMessage: z.string().trim().max(500),
  flowMode: z.enum(['coletar', 'apresentar']),
  introMessage: z.string().trim().max(1000),
  introImages: z
    .array(z.string().trim().url().max(1000).refine((u) => u.startsWith('https://'), 'Use fotos com endereço https'))
    .max(5, 'No máximo 5 fotos'),
  responseMessage: z.string().trim().max(1000),
  responseMode: z.enum(['adaptar', 'exato']),
  pauseAi: z.boolean(),
  isActive: z.boolean(),
}

/** Lista de telefones da equipe: so digitos, sem repetidos, 10 a 13 digitos, ate 20. */
export const telefonesSchema = z
  .array(z.string().max(30))
  .max(20)
  .transform((ns) => [...new Set(ns.map((n) => n.replace(/\D/g, '')).filter(Boolean))])
  .refine((ns) => ns.every((n) => n.length >= 10 && n.length <= 13), 'Telefone inválido: use DDD + número')

/**
 * Formato das Solicitacoes nas respostas da API (o mesmo que a tela usa).
 * Decimal vira numero; datas viram ISO.
 */

export interface CardSolicitacao {
  id: string
  funnel: string
  stage: string
  category: string
  tag: string | null
  ruleKey: string | null
  customerName: string | null
  customerPhone: string | null
  summary: string | null
  data: Record<string, string | number>
  estimatedValue: number | null
  origin: string
  conversationId: string | null
  clientId: string | null
  assignedTo: { id: string; name: string } | null
  createdAt: string
  firstResponseAt: string | null
  closedAt: string | null
  /** Aviso no WhatsApp da equipe (null = nao houve aviso). */
  notifiedAt: string | null
  notifyResult: string | null
}

export const INCLUDE_CARD = {
  rule: { select: { key: true } },
  assignedUser: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.HandoffRequestInclude

type LinhaCard = HandoffRequest & {
  rule: { key: string } | null
  assignedUser: { id: string; fullName: string | null; email: string } | null
}

function lerDados(raw: Prisma.JsonValue): Record<string, string | number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string' || typeof v === 'number') out[k] = v
  }
  return out
}

export function paraCard(r: LinhaCard): CardSolicitacao {
  return {
    id: r.id,
    funnel: r.funnel,
    stage: r.stage,
    category: r.category,
    tag: r.tag,
    ruleKey: r.rule?.key ?? null,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    summary: r.summary,
    data: lerDados(r.data),
    estimatedValue: r.estimatedValue != null ? Number(r.estimatedValue) : null,
    origin: r.origin,
    conversationId: r.conversationId,
    clientId: r.clientId,
    assignedTo: r.assignedUser ? { id: r.assignedUser.id, name: r.assignedUser.fullName || r.assignedUser.email } : null,
    createdAt: r.createdAt.toISOString(),
    firstResponseAt: r.firstResponseAt?.toISOString() ?? null,
    closedAt: r.closedAt?.toISOString() ?? null,
    notifiedAt: r.notifiedAt?.toISOString() ?? null,
    notifyResult: r.notifyResult,
  }
}

export interface RegraApi {
  id: string
  funnel: string
  key: string
  name: string
  tag: string
  trigger: string
  notWhen: string
  examples: string[]
  collectFields: string[]
  askMessage: string
  flowMode: 'coletar' | 'apresentar'
  introMessage: string
  introImages: string[]
  responseMessage: string
  responseMode: 'adaptar' | 'exato'
  pauseAi: boolean
  notifyPhones: string[]
  isSystem: boolean
  isActive: boolean
  sortOrder: number
}

export function paraRegra(r: HandoffRule): RegraApi {
  return {
    id: r.id,
    funnel: r.funnel,
    key: r.key,
    name: r.name,
    tag: r.tag,
    trigger: r.trigger,
    notWhen: r.notWhen,
    examples: r.examples,
    collectFields: r.collectFields,
    askMessage: r.askMessage,
    flowMode: r.flowMode === 'apresentar' ? 'apresentar' : 'coletar',
    introMessage: r.introMessage,
    introImages: r.introImages,
    responseMessage: r.responseMessage,
    responseMode: r.responseMode === 'exato' ? 'exato' : 'adaptar',
    pauseAi: r.pauseAi,
    notifyPhones: r.notifyPhones,
    isSystem: r.isSystem,
    isActive: r.isActive,
    sortOrder: r.sortOrder,
  }
}

/** Inicio do mes corrente no horario de Sao Paulo. */
export function inicioDoMesSaoPaulo(agora = new Date()): Date {
  const anoMes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(agora)
  return new Date(`${anoMes}-01T00:00:00-03:00`)
}

/** "Casamento na praia" -> "casamento_na_praia" (chave que a IA usa). */
export function chaveDaRegra(nome: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36)
  return base.length >= 2 ? base : 'regra'
}

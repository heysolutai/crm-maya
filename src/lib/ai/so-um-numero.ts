import { chaveTelefone } from '@/lib/mcp-crm/telefone.mjs'
import { MOTIVOS } from './motivos'

/**
 * "IA ligada para todos" ou "so para um numero" (AiAgent.onlyPhone): com o
 * numero preenchido a IA responde so esse cliente; os outros ficam com a
 * equipe, como se a IA estivesse desligada. Regra UNICA para os webhooks, o
 * Maestro e o follow-up.
 */

export interface AgenteLigado {
  isActive: boolean
  onlyPhone?: string | null
}

/** Mesmo numero? Com ou sem 55 e com ou sem o nono digito. */
export function mesmoTelefone(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = chaveTelefone(a)
  return ka.length >= 8 && ka === chaveTelefone(b)
}

/** Por que a IA NAO atende este cliente (null = atende). */
export function motivoIaNaoAtende(agente: AgenteLigado, telefoneCliente: string | null | undefined): string | null {
  if (!agente.isActive) return MOTIVOS.IA_DESLIGADA
  if (agente.onlyPhone && !mesmoTelefone(agente.onlyPhone, telefoneCliente)) return MOTIVOS.IA_SO_OUTRO_NUMERO
  return null
}

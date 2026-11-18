import { ESPERA_PADRAO_MAESTRO_S } from '@/lib/aiConfig'
import { resolverAgenteDaConversa } from './agente'
import { comoRecord } from './config'

/**
 * Quanto o MAESTRO espera antes de responder, pra juntar mensagem picada do
 * cliente ("oi" / "queria reservar" / "pra sabado").
 *
 * Vem do agente daquele WhatsApp: Agente de IA › Comportamento › "Esperar o
 * cliente terminar de escrever" (behaviorSettings.message_debounce_seconds), o
 * MESMO campo que o fluxo do n8n le pela API no debounce dele. Sem valor salvo:
 * 10 s.
 *
 * Nao confundir com a espera das Configuracoes de avaliacao
 * (ReviewSettings.agruparSegundos): aquela e do caminho do n8n (avaliacao e
 * fluxo de IA do n8n), no webhook do WhatsApp, e continua como sempre foi.
 */
export function esperaDoAgente(behaviorSettings: unknown): number {
  const n = Number(comoRecord(behaviorSettings).message_debounce_seconds)
  if (!Number.isFinite(n) || n <= 0) return ESPERA_PADRAO_MAESTRO_S
  return Math.min(120, Math.max(1, Math.round(n)))
}

/** Espera do agente da conversa. Erro ao ler o agente: o padrao (a mensagem nunca trava aqui). */
export async function esperaAgrupamentoSegundos(companyId: string, conversationId: string): Promise<number> {
  const agente = await resolverAgenteDaConversa(companyId, conversationId).catch(() => null)
  return esperaDoAgente(agente?.behaviorSettings)
}

/**
 * Tipo do agente de IA. Nao se escolhe: vem da conexao.
 *
 *   - reserve_maya: alguma conexao (WhatsApp) deste agente tem o ID do
 *     restaurante no Reserve Maya. Horarios, turnos, regras de reserva e
 *     precos vem do sistema de reservas (ferramentas/MCP) e da base de
 *     conhecimento: o prompt do agente cuida da identidade e de observacoes.
 *   - personalizado: nenhuma conexao com esse ID (outros segmentos, ou um
 *     restaurante ainda sem integracao). O cliente descreve tudo no prompt.
 *
 * O ID e o que liga a IA ao Reserve Maya (o MCP e as ferramentas recebem o
 * restaurante por ele), entao o tipo segue o ID e nao pode ser trocado a mao.
 * Arquivo puro: nao grava nada.
 */

export type PerfilAgente = 'reserve_maya' | 'personalizado'

export const PERFIS: Record<PerfilAgente, { label: string; hint: string; porque: string }> = {
  reserve_maya: {
    label: 'Restaurante Reserve Maya',
    hint: 'Horários, reservas e preços vêm do Reserve Maya.',
    porque: 'Definido pelo ID do restaurante no Reserve Maya, nesta conexão.',
  },
  personalizado: {
    label: 'Personalizado',
    hint: 'Sem ID do Reserve Maya nesta conexão: descreva tudo no prompt.',
    porque: 'Nenhuma conexão deste agente tem o ID do restaurante no Reserve Maya.',
  },
}

/** ID do restaurante no Reserve Maya gravado na conexao (Inbox.channelConfig.restaurantId). */
export function idDoReserveMaya(channelConfig: unknown): string | null {
  if (!channelConfig || typeof channelConfig !== 'object' || Array.isArray(channelConfig)) return null
  const id = (channelConfig as Record<string, unknown>).restaurantId
  return typeof id === 'string' && id.trim() ? id.trim() : null
}

interface ConexaoDoAgente {
  ai_agent_id: string | null
  restaurant_id?: string | null
}

export function perfilDoAgente(agentId: string | null | undefined, conexoes: ConexaoDoAgente[] | null | undefined): PerfilAgente {
  if (!agentId || !conexoes?.length) return 'personalizado'
  const temId = conexoes.some((c) => c.ai_agent_id === agentId && !!c.restaurant_id?.trim())
  return temId ? 'reserve_maya' : 'personalizado'
}

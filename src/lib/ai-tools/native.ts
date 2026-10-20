import { prisma } from '@/lib/db'
import { pauseClientAI } from '@/lib/ai/pause'
import { logConversationEvent } from '@/lib/conversations/events'
import { publishEvent } from '@/lib/realtime'
import { generateEmbedding, resolveOpenAiKey } from '@/lib/ai/embeddings'
import { searchFaq } from '@/lib/vector-db'
import { registrarReserva } from './post-actions'
import { consultarEventos, registrarInscricaoEvento } from './eventos'
import type { ToolContext, ToolParam } from './types'

/**
 * Ferramentas NATIVAS: acoes do proprio CRM, iguais em todo segmento. O
 * restaurante so liga/desliga (Company.settings.ai_native_tools).
 */

export interface NativeTool {
  name: string
  /** Nome pro cliente ("O que a IA pode fazer"). */
  label: string
  /** Explicacao curta pro cliente. */
  help: string
  /** Quando a IA usa (definicao da funcao). */
  description: string
  promptHint: string
  parameters: ToolParam[]
  isWrite: boolean
  run(ctx: ToolContext, args: Record<string, string | number | boolean>): Promise<{ ok: boolean; result: string; error?: string }>
}

const transferirParaHumano: NativeTool = {
  name: 'transferir_para_humano',
  label: 'Transferir para um atendente',
  help: 'A IA passa a conversa para a equipe quando não souber resolver ou o cliente pedir.',
  description:
    'Transfere a conversa para um atendente humano. Use quando o cliente pedir para falar com uma pessoa, reclamar, ou quando você não conseguir resolver.',
  promptHint:
    'Se o cliente pedir um atendente, reclamar ou você não souber resolver, use transferir_para_humano e avise que um atendente vai continuar.',
  parameters: [{ key: 'motivo', type: 'string', description: 'Motivo da transferência, em uma frase', required: false }],
  isWrite: true,
  async run(ctx, args) {
    if (!ctx.conversa.id) return { ok: false, result: 'Sem conversa para transferir.', error: 'sem conversa' }
    const conv = await prisma.conversation.update({
      where: { id: ctx.conversa.id },
      data: { status: 'pending', transferredTo: null, aiHandled: false, updatedAt: new Date() },
      select: { clientId: true },
    })
    // A IA para de responder ate alguem retomar: a conversa agora e da equipe.
    if (conv.clientId) {
      await pauseClientAI({
        companyId: ctx.empresa.id,
        clientId: conv.clientId,
        conversationId: ctx.conversa.id,
        actor: 'ai',
        minutes: null,
      })
    }
    await logConversationEvent({
      companyId: ctx.empresa.id,
      conversationId: ctx.conversa.id,
      type: 'handoff_human',
      actor: 'ai',
      metadata: { source: 'ai_tool', motivo: typeof args.motivo === 'string' ? args.motivo.slice(0, 300) : null },
    })
    await publishEvent(ctx.empresa.id, {
      type: 'conversation:transferred',
      conversationId: ctx.conversa.id,
      targetUserId: null,
      status: 'pending',
      clientName: ctx.cliente.nome || null,
    })
    return {
      ok: true,
      result: 'Conversa transferida para a equipe. Avise o cliente, com educação, que um atendente vai continuar o atendimento em breve. Não responda mais nada depois disso.',
    }
  },
}

const encaminharParaEventos: NativeTool = {
  name: 'encaminhar_para_eventos',
  label: 'Encaminhar pedidos de eventos',
  help: 'Registra quando o cliente quer um evento (aniversário, confraternização) para a equipe de eventos.',
  description:
    'Registra que o cliente quer um evento especial (aniversário, confraternização, evento fechado) para a equipe de eventos entrar em contato.',
  promptHint:
    'Pedidos de eventos especiais (aniversário, confraternização, evento fechado): colete um resumo e use encaminhar_para_eventos.',
  parameters: [
    { key: 'resumo', type: 'string', description: 'Resumo do pedido: tipo de evento, data, número de pessoas', required: true },
  ],
  isWrite: true,
  async run(ctx, args) {
    if (!ctx.conversa.id) return { ok: false, result: 'Sem conversa para encaminhar.', error: 'sem conversa' }
    await logConversationEvent({
      companyId: ctx.empresa.id,
      conversationId: ctx.conversa.id,
      type: 'handoff_event',
      actor: 'ai',
      metadata: { source: 'ai_tool', resumo: String(args.resumo).slice(0, 500) },
    })
    const conv = await prisma.conversation.findFirst({
      where: { id: ctx.conversa.id, companyId: ctx.empresa.id },
      select: { tags: true },
    })
    if (conv && !conv.tags.includes('Eventos')) {
      await prisma.conversation.update({ where: { id: ctx.conversa.id }, data: { tags: [...conv.tags, 'Eventos'] } })
    }
    await publishEvent(ctx.empresa.id, { type: 'conversation:update', conversationId: ctx.conversa.id })
    return {
      ok: true,
      result: 'Pedido de evento registrado. Avise o cliente que a equipe de eventos vai entrar em contato.',
    }
  },
}

const buscarConhecimento: NativeTool = {
  name: 'buscar_conhecimento',
  label: 'Responder com a base de conhecimento',
  help: 'A IA consulta as perguntas e respostas cadastradas (cardápio, horários, estacionamento...).',
  description:
    'Busca na base de conhecimento do estabelecimento (cardápio, preços, horários, endereço, políticas). Use antes de responder dúvidas sobre o estabelecimento.',
  promptHint: 'Para dúvidas sobre o estabelecimento, consulte buscar_conhecimento antes de responder. Não invente informações.',
  parameters: [{ key: 'pergunta', type: 'string', description: 'A dúvida do cliente, com suas palavras', required: true }],
  isWrite: false,
  async run(ctx, args) {
    if (!ctx.knowledge) {
      return { ok: false, result: 'Base de conhecimento não configurada. Não invente: diga que vai verificar com a equipe.', error: 'sem knowledge' }
    }
    const key = await resolveOpenAiKey(ctx.empresa.id)
    if (!key) {
      return { ok: false, result: 'Base de conhecimento indisponível agora. Não invente: diga que vai verificar com a equipe.', error: 'sem chave openai' }
    }
    const embedding = await generateEmbedding(String(args.pergunta), key)
    if (!embedding) {
      return { ok: false, result: 'Base de conhecimento indisponível agora. Não invente: diga que vai verificar com a equipe.', error: 'embedding falhou' }
    }
    const resultados = await searchFaq(ctx.knowledge, ctx.empresa.id, embedding, 4)
    const relevantes = resultados.filter((r) => r.score >= 0.25)
    if (!relevantes.length) {
      return { ok: true, result: 'Nada encontrado na base de conhecimento sobre isso. Não invente: diga que vai verificar.' }
    }
    return { ok: true, result: relevantes.map((r, i) => `${i + 1}. ${r.text}`).join('\n\n').slice(0, 4000) }
  },
}

const registrarReservaNativa: NativeTool = {
  name: 'registrar_reserva',
  label: 'Registrar reservas no CRM',
  help: 'Para quem não usa sistema de reservas: a IA anota a reserva no CRM (aparece no dashboard).',
  description:
    'Registra uma reserva no CRM depois que o cliente confirmar data, horário e número de pessoas. Use só se não houver outra ferramenta de reserva.',
  promptHint: 'Só registre a reserva depois de confirmar com o cliente a data, o horário e o número de pessoas.',
  parameters: [
    { key: 'data', type: 'date', description: 'Data da reserva', required: true },
    { key: 'hora', type: 'time', description: 'Horário da reserva', required: true },
    { key: 'pessoas', type: 'integer', description: 'Quantidade de pessoas', required: true },
    { key: 'tipo', type: 'string', description: 'normal ou evento', required: false, enum: ['normal', 'evento'] },
    { key: 'observacao', type: 'string', description: 'Observações do cliente', required: false },
  ],
  isWrite: true,
  async run(ctx, args) {
    await registrarReserva(ctx, {
      data: String(args.data),
      hora: String(args.hora),
      pessoas: String(args.pessoas),
      tipo: typeof args.tipo === 'string' ? args.tipo : 'normal',
      observacao: typeof args.observacao === 'string' ? args.observacao : undefined,
    })
    return { ok: true, result: 'Reserva registrada. Confirme os dados com o cliente.' }
  },
}

export const NATIVE_TOOLS: NativeTool[] = [
  buscarConhecimento,
  transferirParaHumano,
  encaminharParaEventos,
  registrarReservaNativa,
  consultarEventos,
  registrarInscricaoEvento,
]

export const NATIVE_TOOL_NAMES = NATIVE_TOOLS.map((t) => t.name)

/** Ligadas por padrao quando o restaurante nunca configurou. */
export const DEFAULT_NATIVE_TOOLS = ['buscar_conhecimento', 'transferir_para_humano']

export function getNativeTool(name: string): NativeTool | undefined {
  return NATIVE_TOOLS.find((t) => t.name === name)
}

/** Nativas ligadas pro restaurante (Company.settings.ai_native_tools). */
export function enabledNativeNames(settings: unknown): string[] {
  const s = settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : {}
  const list = s.ai_native_tools
  if (!Array.isArray(list)) return DEFAULT_NATIVE_TOOLS
  return list.filter((n): n is string => typeof n === 'string' && NATIVE_TOOL_NAMES.includes(n))
}

import { prisma } from '@/lib/db'
import { logConversationEvent } from '@/lib/conversations/events'
import { publishEvent } from '@/lib/realtime'
import { renderValue, type TemplateVars } from './template'
import type { PostAction, ToolContext } from './types'

/**
 * Acoes no CRM depois de uma ferramenta dar certo. E o que liga a integracao
 * ao resto do sistema sem codigo: a reserva feita no Reserve Maya entra no
 * dashboard, o encaminhamento conta, a etiqueta aparece na conversa.
 *
 * Falha aqui NAO desfaz a acao externa (a reserva ja existe la): so vai pro
 * log. A IA recebe o resultado da ferramenta normalmente.
 */

function texto(v: unknown): string {
  return v === undefined || v === null ? '' : String(v).trim()
}

/** AAAA-MM-DD + HH:MM em horario de Sao Paulo -> Date (UTC). Sem horario de verao desde 2019. */
export function dataHoraSaoPaulo(data: string, hora: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null
  const h = /^\d{1,2}:\d{2}$/.test(hora) ? hora.padStart(5, '0') : '12:00'
  const d = new Date(`${data}T${h}:00-03:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function registrarReserva(
  ctx: ToolContext,
  dados: { data: string; hora: string; pessoas?: string; codigo?: string; observacao?: string; tipo?: string }
): Promise<string> {
  const pessoas = Number.parseInt(dados.pessoas || '', 10)
  const reserva = await prisma.reservation.create({
    data: {
      companyId: ctx.empresa.id,
      conversationId: ctx.conversa.id,
      clientId: ctx.cliente.id,
      source: 'ai',
      type: dados.tipo === 'evento' ? 'evento' : 'normal',
      customerName: ctx.cliente.nome || null,
      partySize: Number.isInteger(pessoas) && pessoas > 0 && pessoas <= 1000 ? pessoas : null,
      reservedFor: dataHoraSaoPaulo(dados.data, dados.hora),
      status: 'confirmed',
      notes: dados.observacao ? dados.observacao.slice(0, 2000) : null,
      metadata: {
        origem: 'ferramenta_ia',
        ...(dados.codigo ? { external_code: dados.codigo } : {}),
      },
    },
    select: { id: true },
  })
  return reserva.id
}

export async function runPostActions(actions: PostAction[], ctx: ToolContext, vars: TemplateVars): Promise<string[]> {
  const erros: string[] = []

  for (const raw of actions) {
    try {
      const action = renderValue(raw, vars) as Record<string, unknown>
      switch (action.type) {
        case 'registrar_reserva': {
          await registrarReserva(ctx, {
            data: texto(action.data),
            hora: texto(action.hora),
            pessoas: texto(action.pessoas),
            codigo: texto(action.codigo),
            observacao: texto(action.observacao),
            tipo: texto(action.tipo),
          })
          break
        }
        case 'cancelar_reserva_crm': {
          const codigo = texto(action.codigo)
          if (!codigo) break
          await prisma.reservation.updateMany({
            where: { companyId: ctx.empresa.id, metadata: { path: ['external_code'], equals: codigo } },
            data: { status: 'cancelled' },
          })
          break
        }
        case 'registrar_encaminhamento': {
          if (!ctx.conversa.id) break
          await logConversationEvent({
            companyId: ctx.empresa.id,
            conversationId: ctx.conversa.id,
            type: action.destino === 'evento' ? 'handoff_event' : 'handoff_human',
            actor: 'ai',
            metadata: { source: 'ai_tool' },
          })
          break
        }
        case 'adicionar_etiqueta': {
          const etiqueta = texto(action.etiqueta).slice(0, 60)
          if (!ctx.conversa.id || !etiqueta) break
          const conv = await prisma.conversation.findFirst({
            where: { id: ctx.conversa.id, companyId: ctx.empresa.id },
            select: { tags: true },
          })
          if (conv && !conv.tags.includes(etiqueta)) {
            await prisma.conversation.update({
              where: { id: ctx.conversa.id },
              data: { tags: [...conv.tags, etiqueta] },
            })
            await publishEvent(ctx.empresa.id, { type: 'conversation:update', conversationId: ctx.conversa.id })
          }
          break
        }
        default:
          erros.push(`acao desconhecida: ${String(action.type)}`)
      }
    } catch (error) {
      console.error('[ai-tools] acao pos-ferramenta falhou', raw.type, error)
      erros.push(`${raw.type}: ${error instanceof Error ? error.message : 'erro'}`)
    }
  }
  return erros
}

/** Leitura defensiva do JSON salvo. */
export function parsePostActions(raw: unknown): PostAction[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (a): a is PostAction =>
      !!a &&
      typeof a === 'object' &&
      ['registrar_reserva', 'cancelar_reserva_crm', 'registrar_encaminhamento', 'adicionar_etiqueta'].includes(
        String((a as Record<string, unknown>).type)
      )
  )
}

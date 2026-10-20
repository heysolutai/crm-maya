import { prisma } from '@/lib/db'
import { publishEvent } from '@/lib/realtime'
import { isAiPausedNow } from './pause'
import { MOTIVOS } from './motivos'

/**
 * Registro da IA (tabela ai_turns). Nenhuma funcao daqui lanca: falha no
 * registro nunca pode derrubar o atendimento.
 */

const TEXTO_MAX = 1000

/** Janela pra ligar a resposta da IA ao turno que a disparou. */
const JANELA_RESPOSTA_MS = 30 * 60 * 1000

/**
 * Depois de pausar por conta propria (ferramenta "transferir para humano"),
 * a IA ainda pode mandar a mensagem de despedida.
 */
const CARENCIA_PAUSA_DA_IA_MS = 2 * 60 * 1000

export interface RegistrarTurnoInput {
  /** Id fixo (o Maestro usa o mesmo id como runId das ferramentas). Omitido = o banco gera. */
  id?: string
  companyId: string
  conversationId: string
  messageIds: string[]
  texto: string | null
  /** 'respondido' direto so no Maestro; o n8n cria 'enviado' e fecha com marcarRespondido. */
  status: 'enviado' | 'respondido' | 'ignorado' | 'erro'
  motivo?: string | null
  destino?: 'webhook' | 'fluxo_externo' | 'maestro' | null
  aiStatus?: string | null
  pausadoAte?: Date | null
  httpStatus?: number | null
  resposta?: string | null
  respondidoEm?: Date | null
  latencyMs?: number | null
}

/** Devolve o id do turno criado (null se falhou: o registro nunca derruba o atendimento). */
export async function registrarTurno(input: RegistrarTurnoInput): Promise<string | null> {
  try {
    const criado = await prisma.aiTurn.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        companyId: input.companyId,
        conversationId: input.conversationId,
        messageIds: input.messageIds,
        texto: input.texto ? input.texto.slice(0, TEXTO_MAX) : null,
        status: input.status,
        motivo: input.motivo ?? null,
        destino: input.destino ?? null,
        aiStatus: input.aiStatus ?? null,
        pausadoAte: input.pausadoAte ?? null,
        httpStatus: input.httpStatus ?? null,
        resposta: input.resposta ? input.resposta.slice(0, TEXTO_MAX) : null,
        respondidoEm: input.respondidoEm ?? null,
        latencyMs: input.latencyMs ?? null,
      },
      select: { id: true },
    })
    await publishEvent(input.companyId, { type: 'execution:log', conversationId: input.conversationId })
    return criado.id
  } catch (error) {
    console.error('[ai-turns] falha ao registrar turno', input.status, error)
    return null
  }
}

export interface AtualizarTurnoInput {
  status?: 'enviado' | 'respondido' | 'ignorado' | 'erro'
  motivo?: string | null
  resposta?: string | null
  respondidoEm?: Date | null
  latencyMs?: number | null
  pausadoAte?: Date | null
}

/**
 * Atualiza UM turno ja criado, pelo id (o Maestro cria o turno 'enviado' quando
 * comeca a preparar a resposta e fecha aqui: respondido, descartado ou erro).
 * Sempre filtra por companyId. Nunca lanca.
 */
export async function atualizarTurno(companyId: string, turnoId: string, patch: AtualizarTurnoInput): Promise<void> {
  try {
    const { resposta, ...resto } = patch
    const r = await prisma.aiTurn.updateMany({
      where: { id: turnoId, companyId },
      data: {
        ...resto,
        ...(resposta !== undefined ? { resposta: resposta ? resposta.slice(0, TEXTO_MAX) : null } : {}),
      },
    })
    if (r.count === 0) return
    const turno = await prisma.aiTurn.findFirst({ where: { id: turnoId, companyId }, select: { conversationId: true } })
    if (turno) await publishEvent(companyId, { type: 'execution:log', conversationId: turno.conversationId })
  } catch (error) {
    console.error('[ai-turns] falha ao atualizar turno', error)
  }
}

/** A resposta da IA saiu: fecha o turno pendente mais recente da conversa. */
export async function marcarRespondido(companyId: string, conversationId: string, resposta: string): Promise<void> {
  try {
    const pendente = await prisma.aiTurn.findFirst({
      where: {
        companyId,
        conversationId,
        status: 'enviado',
        respondidoEm: null,
        createdAt: { gte: new Date(Date.now() - JANELA_RESPOSTA_MS) },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true },
    })
    if (!pendente) return
    const agora = new Date()
    await prisma.aiTurn.update({
      where: { id: pendente.id },
      data: {
        status: 'respondido',
        resposta: resposta.slice(0, TEXTO_MAX),
        respondidoEm: agora,
        latencyMs: agora.getTime() - pendente.createdAt.getTime(),
      },
    })
    await publishEvent(companyId, { type: 'execution:log', conversationId })
  } catch (error) {
    console.error('[ai-turns] falha ao marcar respondido', error)
  }
}

export type ChecagemEnvio = { permitido: true } | { permitido: false; ate: Date | null }

/**
 * A IA pode falar agora? Pausada (atendente respondeu, alguem pausou) = nao.
 * E aqui que a pausa vale pro fluxo INTEIRO: n8n, Maestro ou qualquer outro
 * orquestrador que mande resposta com fromAI passa por esta trava.
 */
export async function checarEnvioDaIA(companyId: string, conversationId: string): Promise<ChecagemEnvio> {
  try {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, companyId },
      select: { client: { select: { aiPaused: true, aiPausedUntil: true, aiPausedAt: true, aiPausedBy: true } } },
    })
    const c = conv?.client
    if (!c || !isAiPausedNow(c)) return { permitido: true }
    const pausouAgoraPelaIA =
      c.aiPausedBy === 'ai' && c.aiPausedAt && Date.now() - c.aiPausedAt.getTime() < CARENCIA_PAUSA_DA_IA_MS
    if (pausouAgoraPelaIA) return { permitido: true }
    return { permitido: false, ate: c.aiPausedUntil }
  } catch (error) {
    // Na duvida, nao trava o atendimento.
    console.error('[ai-turns] falha ao checar pausa', error)
    return { permitido: true }
  }
}

/** Resposta da IA barrada pela pausa: soma no turno mais recente (ou cria um). */
export async function registrarBloqueio(companyId: string, conversationId: string, ate: Date | null): Promise<void> {
  try {
    const recente = await prisma.aiTurn.findFirst({
      where: { companyId, conversationId, createdAt: { gte: new Date(Date.now() - JANELA_RESPOSTA_MS) } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true },
    })
    if (recente && recente.status !== 'respondido') {
      await prisma.aiTurn.update({
        where: { id: recente.id },
        data: {
          bloqueios: { increment: 1 },
          status: 'ignorado',
          motivo: recente.status === 'enviado' ? MOTIVOS.RESPOSTA_BLOQUEADA : undefined,
          pausadoAte: ate,
        },
      })
    } else {
      await prisma.aiTurn.create({
        data: {
          companyId,
          conversationId,
          status: 'ignorado',
          motivo: MOTIVOS.RESPOSTA_BLOQUEADA,
          pausadoAte: ate,
          bloqueios: 1,
        },
      })
    }
    await publishEvent(companyId, { type: 'execution:log', conversationId })
  } catch (error) {
    console.error('[ai-turns] falha ao registrar bloqueio', error)
  }
}

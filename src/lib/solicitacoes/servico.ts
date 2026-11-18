import { Prisma, type HandoffRule } from '@prisma/client'
import { prisma } from '@/lib/db'
import { pauseClientAI } from '@/lib/ai/pause'
import { logConversationEvent, type ConversationEventActor } from '@/lib/conversations/events'
import { publishEvent } from '@/lib/realtime'
import { FUNIS, dadosEmTexto, ehFunil, etapasAbertas, preencherResposta, type Funil } from './funis'
import { REGRA_FALHA_IA, REGRAS_PADRAO } from './regras-padrao'

/**
 * Solicitacoes: a IA (ou o sistema) abre um card no funil de eventos
 * personalizados ou no de atendimento humano, conforme a regra. Aqui fica o
 * que acontece na conversa junto: etiqueta, nota para o atendente, evento de
 * metrica e, se a regra manda, a conversa vai para a equipe com a IA pausada.
 */

export type OrigemSolicitacao = 'ia' | 'sistema_reservas' | 'sistema' | 'atendente'

export type DadosSolicitacao = Record<string, string | number>

/**
 * Garante as regras padrao do restaurante. Sem nenhuma regra: cria todas.
 * Com regras: so recria a automatica (falha da IA), que nao se apaga. Nunca
 * recria uma regra que o restaurante apagou.
 */
export async function garantirRegras(companyId: string): Promise<void> {
  const total = await prisma.handoffRule.count({ where: { companyId } })
  const faltando =
    total === 0
      ? REGRAS_PADRAO
      : (await prisma.handoffRule.findFirst({ where: { companyId, key: REGRA_FALHA_IA }, select: { id: true } }))
        ? []
        : REGRAS_PADRAO.filter((r) => r.key === REGRA_FALHA_IA)
  if (!faltando.length) return
  await prisma.handoffRule.createMany({
    data: faltando.map((r) => ({
      companyId,
      funnel: r.funnel,
      key: r.key,
      name: r.name,
      tag: r.tag,
      trigger: r.trigger,
      notWhen: r.notWhen,
      examples: r.examples,
      collectFields: r.collectFields,
      askMessage: r.askMessage ?? '',
      responseMessage: r.responseMessage,
      pauseAi: r.pauseAi,
      isSystem: r.isSystem ?? false,
      sortOrder: REGRAS_PADRAO.indexOf(r),
    })),
    // Duas leituras ao mesmo tempo (tela + IA) nao duplicam: chave unica.
    skipDuplicates: true,
  })
}

/** Regras do restaurante (todas), na ordem da tela. */
export async function listarRegras(companyId: string): Promise<HandoffRule[]> {
  await garantirRegras(companyId)
  return prisma.handoffRule.findMany({
    where: { companyId },
    orderBy: [{ funnel: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
}

/** Regras que a IA pode escolher: ligadas e nao automaticas. */
export async function regrasDaIA(companyId: string): Promise<HandoffRule[]> {
  const regras = await listarRegras(companyId)
  return regras.filter((r) => r.isActive && !r.isSystem)
}

function textoDaNota(p: { regra: HandoffRule; origem: OrigemSolicitacao; resumo: string | null; dados: DadosSolicitacao; nova: boolean }): string {
  const funil = ehFunil(p.regra.funnel) ? FUNIS[p.regra.funnel].label : p.regra.funnel
  const quem =
    p.origem === 'sistema_reservas'
      ? 'pela IA (sugestão do sistema de reservas)'
      : p.origem === 'sistema'
        ? 'automaticamente'
        : p.origem === 'atendente'
          ? 'pela equipe'
          : 'pela IA'
  const linhas = [`${p.nova ? 'Solicitação aberta' : 'Solicitação atualizada'} ${quem}: ${funil} › ${p.regra.name}`]
  if (p.resumo) linhas.push(`Resumo: ${p.resumo}`)
  const dados = dadosEmTexto(p.dados)
  if (dados) linhas.push(dados)
  linhas.push('Acompanhe no CRM.')
  return linhas.join('\n')
}

async function registrarNota(companyId: string, conversationId: string, note: string): Promise<void> {
  try {
    const noteRecord = await prisma.conversationNote.create({
      data: { companyId, conversationId, createdBy: null, note },
      include: { creator: { select: { fullName: true, avatarUrl: true } } },
    })
    await publishEvent(companyId, { type: 'note:new', conversationId, note: noteRecord })
  } catch (err) {
    console.error('[solicitacoes] falha ao registrar a nota:', (err as Error)?.message)
  }
}

async function aplicarEtiqueta(companyId: string, conversationId: string, etiqueta: string): Promise<void> {
  const tag = etiqueta.trim().slice(0, 60)
  if (!tag) return
  const conv = await prisma.conversation.findFirst({ where: { id: conversationId, companyId }, select: { tags: true } })
  if (conv && !conv.tags.includes(tag)) {
    await prisma.conversation.update({ where: { id: conversationId }, data: { tags: [...conv.tags, tag] } })
  }
}

export interface AbrirSolicitacaoInput {
  companyId: string
  regra: HandoffRule
  conversationId: string | null
  clientId: string | null
  clienteNome: string | null
  clienteTelefone: string | null
  resumo: string | null
  dados?: DadosSolicitacao
  valorEstimado?: number | null
  origem: OrigemSolicitacao
  actor: ConversationEventActor
  /**
   * true = so registra o card e a etiqueta. Quem chama ja cuidou da conversa
   * (fila, pausa, nota, evento): e o caso do fallback do Maestro.
   */
  soRegistrar?: boolean
}

export interface SolicitacaoAberta {
  id: string
  /** false = ja havia uma aberta da mesma regra nesta conversa (foi atualizada). */
  nova: boolean
}

/**
 * Abre a solicitacao. Se a conversa ja tem uma ABERTA da mesma regra, atualiza
 * essa (a IA chamando duas vezes nao vira dois cards).
 */
export async function abrirSolicitacao(p: AbrirSolicitacaoInput): Promise<SolicitacaoAberta> {
  const funil: Funil = ehFunil(p.regra.funnel) ? p.regra.funnel : 'atendimento'
  const dados = p.dados ?? {}
  const resumo = p.resumo?.trim().slice(0, 2000) || null

  const existente = p.conversationId
    ? await prisma.handoffRequest.findFirst({
        where: {
          companyId: p.companyId,
          conversationId: p.conversationId,
          funnel: funil,
          ruleId: p.regra.id,
          stage: { in: etapasAbertas(funil) },
        },
        select: { id: true, data: true },
      })
    : null

  let id: string
  if (existente) {
    const anteriores =
      existente.data && typeof existente.data === 'object' && !Array.isArray(existente.data)
        ? (existente.data as Record<string, string | number>)
        : {}
    await prisma.handoffRequest.update({
      where: { id: existente.id },
      data: {
        ...(resumo ? { summary: resumo } : {}),
        data: { ...anteriores, ...dados } as Prisma.InputJsonValue,
        ...(p.valorEstimado != null ? { estimatedValue: p.valorEstimado } : {}),
      },
    })
    id = existente.id
  } else {
    const criada = await prisma.handoffRequest.create({
      data: {
        companyId: p.companyId,
        funnel: funil,
        stage: FUNIS[funil].inicial,
        ruleId: p.regra.id,
        category: p.regra.name,
        tag: p.regra.tag,
        clientId: p.clientId,
        conversationId: p.conversationId,
        customerName: p.clienteNome?.slice(0, 200) || null,
        customerPhone: p.clienteTelefone?.slice(0, 40) || null,
        summary: resumo,
        data: dados as Prisma.InputJsonValue,
        estimatedValue: p.valorEstimado ?? null,
        origin: p.origem,
      },
      select: { id: true },
    })
    id = criada.id
  }
  const nova = !existente

  // Solicitacao nova: avisa a equipe no WhatsApp (se o funil tiver aviso
  // ligado). Sem await: o aviso nao atrasa a resposta da IA; nunca lanca.
  // Import dinamico: avisos usa o envio do Maestro, que importa este arquivo.
  if (nova) {
    void import('./avisos')
      .then((m) => m.avisarEquipe(id))
      .catch((err) => console.error('[solicitacoes] falha ao disparar o aviso:', (err as Error)?.message))
  }

  if (!p.conversationId) return { id, nova }
  const conversationId = p.conversationId

  // Daqui pra baixo e efeito colateral: nenhum deles desfaz a solicitacao.
  try {
    await aplicarEtiqueta(p.companyId, conversationId, p.regra.tag)
  } catch (err) {
    console.error('[solicitacoes] falha ao aplicar a etiqueta:', (err as Error)?.message)
  }
  if (p.soRegistrar) return { id, nova }

  await registrarNota(p.companyId, conversationId, textoDaNota({ regra: p.regra, origem: p.origem, resumo, dados, nova }))

  if (nova) {
    await logConversationEvent({
      companyId: p.companyId,
      conversationId,
      type: funil === 'eventos' ? 'handoff_event' : 'handoff_human',
      actor: p.actor,
      metadata: { source: 'solicitacao', regra: p.regra.key, solicitacao: id, origem: p.origem },
    })
  }

  if (p.regra.pauseAi) {
    try {
      // Conversa encerrada nao reabre sozinha.
      await prisma.conversation.updateMany({
        where: { id: conversationId, companyId: p.companyId, status: { not: 'closed' } },
        data: { status: 'pending', transferredTo: null, aiHandled: false, updatedAt: new Date() },
      })
      if (p.clientId) {
        await pauseClientAI({ companyId: p.companyId, clientId: p.clientId, conversationId, actor: p.actor, minutes: null })
      }
    } catch (err) {
      console.error('[solicitacoes] falha ao passar a conversa para a equipe:', (err as Error)?.message)
    }
    await publishEvent(p.companyId, {
      type: 'conversation:transferred',
      conversationId,
      targetUserId: null,
      status: 'pending',
      clientName: p.clienteNome || null,
    })
  } else {
    await publishEvent(p.companyId, { type: 'conversation:update', conversationId })
  }

  return { id, nova }
}

/** O que a ferramenta devolve para a IA: como responder o cliente agora. */
export function respostaParaIA(regra: HandoffRule, vars: { nome?: string | null; resumo?: string | null; restaurante?: string | null }): string {
  const funil = ehFunil(regra.funnel) ? FUNIS[regra.funnel].label : regra.funnel
  const mensagem = preencherResposta(regra.responseMessage || '', vars)
  const partes = [`Solicitação registrada (${funil} › ${regra.name}).`]
  if (mensagem) {
    partes.push(
      regra.responseMode === 'exato'
        ? `Envie ao cliente exatamente este texto, sem mudar nada: "${mensagem}"`
        : `Responda ao cliente com base nesta mensagem, adaptando ao contexto da conversa sem mudar o sentido nem prometer nada além dela: "${mensagem}"`
    )
  } else {
    partes.push('Avise o cliente, com educação, que a equipe vai continuar o atendimento.')
  }
  partes.push(
    regra.pauseAi
      ? 'Depois disso não responda mais nada: a equipe continua o atendimento.'
      : 'Depois, siga o atendimento normalmente.'
  )
  return partes.join(' ')
}

/**
 * A equipe respondeu a conversa (CRM ou celular): a solicitacao aberta que
 * ainda estava na entrada anda para "em atendimento" / "em contato" e marca o
 * primeiro atendimento. Nunca lanca.
 */
export async function marcarAtendimentoIniciado(conversationId: string): Promise<void> {
  try {
    const agora = new Date()
    for (const funil of Object.keys(FUNIS) as Funil[]) {
      await prisma.handoffRequest.updateMany({
        where: { conversationId, funnel: funil, stage: FUNIS[funil].inicial },
        data: { stage: FUNIS[funil].aoAtender, firstResponseAt: agora },
      })
    }
    await prisma.handoffRequest.updateMany({
      where: { conversationId, firstResponseAt: null, closedAt: null },
      data: { firstResponseAt: agora },
    })
  } catch (err) {
    console.error('[solicitacoes] falha ao marcar o atendimento:', (err as Error)?.message)
  }
}

/**
 * Conversa encerrada: o que estava aberto no funil de atendimento humano vira
 * "resolvido". Eventos nao mudam (a venda continua depois da conversa). Nunca lanca.
 */
export async function concluirAtendimentosDaConversa(companyId: string, conversationId: string): Promise<void> {
  try {
    await prisma.handoffRequest.updateMany({
      where: { companyId, conversationId, funnel: 'atendimento', stage: { in: etapasAbertas('atendimento') } },
      data: { stage: 'resolvido', closedAt: new Date() },
    })
  } catch (err) {
    console.error('[solicitacoes] falha ao concluir atendimentos da conversa:', (err as Error)?.message)
  }
}

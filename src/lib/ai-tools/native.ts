import { prisma } from '@/lib/db'
import { pauseClientAI } from '@/lib/ai/pause'
import { logConversationEvent } from '@/lib/conversations/events'
import { publishEvent } from '@/lib/realtime'
import { generateEmbedding, resolveOpenAiKey } from '@/lib/ai/embeddings'
import { searchFaq } from '@/lib/vector-db'
import { registrarReserva } from './post-actions'
import { consultarEventos, registrarInscricaoEvento } from './eventos'
import { abrirSolicitacao, regrasDaIA, respostaParaIA, type DadosSolicitacao } from '@/lib/solicitacoes/servico'
import { REGRA_ATENDIMENTO_PADRAO, REGRA_EVENTO_PADRAO } from '@/lib/solicitacoes/regras-padrao'
import { valorEmReais } from '@/lib/solicitacoes/funis'
import { mensagemPedindoDados } from '@/lib/solicitacoes/perguntas'
import { enviarImagensDaIA } from './enviar-midia'
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

/** Primeiro nome para a resposta ({nome}). Nome que e so telefone fica vazio. */
function primeiroNome(nome: string | null | undefined): string {
  const n = (nome || '').trim()
  if (!n || /^[\d\s+()-]+$/.test(n)) return ''
  return n.split(/\s+/)[0]
}

/** "Data: 12/12; Pessoas: 30" -> { Data: '12/12', Pessoas: '30' }. Ate 12 campos curtos. */
function lerDados(texto: unknown): DadosSolicitacao {
  if (typeof texto !== 'string' || !texto.trim()) return {}
  const dados: DadosSolicitacao = {}
  for (const parte of texto.split(/[;\n]+/).slice(0, 12)) {
    const i = parte.indexOf(':')
    if (i <= 0) continue
    const campo = parte.slice(0, i).trim().slice(0, 60)
    const valor = parte.slice(i + 1).trim().slice(0, 300)
    if (campo && valor) dados[campo] = valor
  }
  return dados
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''
}

/**
 * Regra escolhida pela IA no funil, ou a padrao. null = o restaurante desligou
 * todas as regras do funil.
 */
async function regraDoFunil(companyId: string, funil: 'eventos' | 'atendimento', pedida: string, padrao: string) {
  const regras = (await regrasDaIA(companyId)).filter((r) => r.funnel === funil)
  return regras.find((r) => r.key === pedida) ?? regras.find((r) => r.key === padrao) ?? regras[0] ?? null
}

const transferirParaHumano: NativeTool = {
  name: 'transferir_para_humano',
  label: 'Transferir para um atendente',
  help: 'A IA abre uma solicitação no CRM, em Atendimento humano (dúvida sem resposta, reclamação…), e passa a conversa para a equipe.',
  description:
    'Passa a conversa para a equipe e abre uma solicitação em Atendimento humano, na categoria certa. Use quando o cliente pedir uma pessoa, reclamar, tiver um problema que as ferramentas não resolvem, ou você não souber a resposta depois de consultar as ferramentas. Não use para fazer, consultar, alterar ou cancelar reserva que as ferramentas de reserva resolvem.',
  promptHint:
    'Se o cliente pedir um atendente, reclamar ou você não souber resolver, use transferir_para_humano com a categoria certa e responda como a ferramenta indicar.',
  parameters: [
    { key: 'categoria', type: 'string', description: 'Categoria do encaminhamento (veja o roteiro de quando usar cada uma)', required: false },
    { key: 'motivo', type: 'string', description: 'O que o cliente pediu ou perguntou, em uma frase, com as palavras dele (vai para a equipe)', required: false },
    {
      key: 'dados',
      type: 'string',
      description: 'Só os dados que o cliente informou nesta conversa, no formato "Campo: valor; Campo: valor". Nunca deduza nem invente',
      required: false,
    },
  ],
  isWrite: true,
  async run(ctx, args) {
    if (!ctx.conversa.id) return { ok: false, result: 'Sem conversa para transferir.', error: 'sem conversa' }
    const regra = await regraDoFunil(ctx.empresa.id, 'atendimento', texto(args.categoria), REGRA_ATENDIMENTO_PADRAO)
    if (regra) {
      const motivo = texto(args.motivo) || null
      await abrirSolicitacao({
        companyId: ctx.empresa.id,
        regra,
        conversationId: ctx.conversa.id,
        clientId: ctx.cliente.id,
        clienteNome: ctx.cliente.nome || null,
        clienteTelefone: ctx.cliente.telefone || null,
        resumo: motivo,
        dados: lerDados(args.dados),
        origem: 'ia',
        actor: 'ai',
      })
      return {
        ok: true,
        result: respostaParaIA(regra, { nome: primeiroNome(ctx.cliente.nome), resumo: motivo, restaurante: ctx.empresa.nome }),
      }
    }

    // Todas as regras de atendimento desligadas: transfere como sempre, sem card.
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
  label: 'Encaminhar eventos personalizados',
  help: 'Aniversário com cardápio fechado, corporativo, casamento, grupo grande: a IA coleta os dados e abre uma solicitação no CRM, em Eventos personalizados.',
  description:
    'Abre uma solicitação em Eventos personalizados para a equipe de eventos montar a proposta. Use quando o cliente quer montar o próprio evento (aniversário com cardápio fechado, corporativo, palestra, casamento, fechar o espaço) ou quando o sistema de reservas recusou o grupo pelo tamanho. Não use para reserva de um evento especial da programação da casa (show, réveillon, data comemorativa): isso é reserva.',
  promptHint:
    'Evento que o cliente quer montar (particular, corporativo, casamento, fechar o espaço): colete os dados e use encaminhar_para_eventos. Evento especial da programação da casa é reserva.',
  parameters: [
    {
      key: 'resumo',
      type: 'string',
      description: 'Resumo curto do pedido com as palavras do cliente. Só o que ele disse nesta conversa, sem deduzir nada',
      required: true,
    },
    { key: 'categoria', type: 'string', description: 'Tipo de solicitação de evento (veja o roteiro)', required: false },
    { key: 'tipo_evento', type: 'string', description: 'Tipo de evento, se o cliente disse (aniversário, corporativo, casamento...)', required: false },
    { key: 'data', type: 'date', description: 'Data desejada, só se o cliente disse', required: false },
    { key: 'pessoas', type: 'integer', description: 'Número de pessoas, só se o cliente disse. Nunca estime', required: false },
    { key: 'orcamento', type: 'string', description: 'Orçamento, só se o cliente comentou, do jeito que ele disse (ex.: "uns 3 mil")', required: false },
    {
      key: 'dados',
      type: 'string',
      description: 'Outros dados que o cliente informou nesta conversa, no formato "Campo: valor; Campo: valor". Nunca invente',
      required: false,
    },
    {
      key: 'origem',
      type: 'string',
      description: 'sistema_de_reservas quando uma ferramenta de reserva disse que o pedido foge da regra; senão cliente',
      required: false,
      enum: ['cliente', 'sistema_de_reservas'],
    },
  ],
  isWrite: true,
  async run(ctx, args) {
    if (!ctx.conversa.id) return { ok: false, result: 'Sem conversa para encaminhar.', error: 'sem conversa' }
    const regra = await regraDoFunil(ctx.empresa.id, 'eventos', texto(args.categoria), REGRA_EVENTO_PADRAO)
    if (regra) {
      const resumo = texto(args.resumo) || null
      const orcamento = texto(args.orcamento)
      const dados: DadosSolicitacao = {
        ...(texto(args.tipo_evento) ? { 'Tipo de evento': texto(args.tipo_evento) } : {}),
        ...(texto(args.data) ? { Data: texto(args.data) } : {}),
        ...(typeof args.pessoas === 'number' ? { 'Número de pessoas': args.pessoas } : {}),
        ...(orcamento ? { Orçamento: orcamento } : {}),
        ...lerDados(args.dados),
      }
      await abrirSolicitacao({
        companyId: ctx.empresa.id,
        regra,
        conversationId: ctx.conversa.id,
        clientId: ctx.cliente.id,
        clienteNome: ctx.cliente.nome || null,
        clienteTelefone: ctx.cliente.telefone || null,
        resumo,
        dados,
        valorEstimado: valorEmReais(orcamento),
        origem: args.origem === 'sistema_de_reservas' ? 'sistema_reservas' : 'ia',
        actor: 'ai',
      })
      return {
        ok: true,
        result: respostaParaIA(regra, { nome: primeiroNome(ctx.cliente.nome), resumo, restaurante: ctx.empresa.nome }),
      }
    }

    // Regras de eventos desligadas: registra como antes (etiqueta + metrica), sem card.
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

/** O que a IA faz depois da apresentacao: pedir os dados (sempre numa mensagem so) ou encaminhar. */
export function proximoPassoDaColeta(regra: { collectFields: string[]; askMessage: string }): string {
  if (!regra.collectFields.length) return 'Depois, se o cliente quiser seguir, chame encaminhar_para_eventos.'
  return `Agora peça os dados numa única mensagem, exatamente assim: "${mensagemPedindoDados(regra.collectFields, regra.askMessage)}". Se ele responder só uma parte, peça apenas o que faltou.`
}

/**
 * Triagem com apresentacao (regra de evento no modo 'apresentar'): manda a
 * apresentacao EXATAMENTE como o restaurante escreveu e as fotos, e devolve a
 * primeira pergunta. Nao aparece na aba Ferramentas: vem junto com
 * "Encaminhar eventos personalizados" quando alguma regra usa apresentacao.
 */
export const apresentarEventoPersonalizado: NativeTool = {
  name: 'apresentar_evento_personalizado',
  label: 'Apresentar evento personalizado',
  help: 'Envia a apresentação (texto e fotos) da regra de evento antes de coletar os dados.',
  description:
    'Envia ao cliente a apresentação do evento personalizado (texto e fotos cadastrados pelo restaurante) antes de coletar os dados. Use só nas regras que pedem apresentação, uma vez por conversa.',
  promptHint: 'Use só nas regras de evento que pedem apresentação, antes das perguntas (veja o roteiro).',
  parameters: [{ key: 'categoria', type: 'string', description: 'Categoria da regra de evento (veja o roteiro)', required: true }],
  isWrite: true,
  async run(ctx, args) {
    if (!ctx.conversa.id) return { ok: false, result: 'Sem conversa para apresentar.', error: 'sem conversa' }
    const regras = (await regrasDaIA(ctx.empresa.id)).filter((r) => r.funnel === 'eventos' && r.flowMode === 'apresentar')
    const regra = regras.find((r) => r.key === texto(args.categoria)) ?? regras[0]
    if (!regra || !regra.introMessage.trim()) {
      return { ok: false, result: 'Esta regra não tem apresentação cadastrada. Siga direto para as perguntas.', error: 'sem apresentacao' }
    }
    const depois = proximoPassoDaColeta(regra)

    if (regra.introImages.length) {
      // A apresentacao vai como legenda da primeira foto: chega exatamente como foi escrita.
      const r = await enviarImagensDaIA({
        companyId: ctx.empresa.id,
        conversationId: ctx.conversa.id,
        urls: regra.introImages,
        legendaPrimeira: regra.introMessage.trim(),
      })
      if (r.enviadas > 0) {
        return { ok: true, result: `A apresentação e ${r.enviadas === 1 ? 'a foto foram enviadas' : `as ${r.enviadas} fotos foram enviadas`} ao cliente. Não repita a apresentação. ${depois}` }
      }
      // Fotos falharam: segue so com o texto, para o cliente nao ficar sem resposta.
      return {
        ok: true,
        result: `Não consegui enviar as fotos. Envie ao cliente exatamente esta apresentação: "${regra.introMessage.trim()}". ${depois}`,
        error: `fotos nao enviadas: ${r.motivo ?? 'motivo desconhecido'}`,
      }
    }
    return { ok: true, result: `Envie ao cliente exatamente esta apresentação, sem mudar nada: "${regra.introMessage.trim()}". ${depois}` }
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

export const NATIVE_TOOLS: NativeTool[] = [buscarConhecimento, transferirParaHumano, encaminharParaEventos]

/**
 * Aposentadas no produto restaurante: reservas (normais e especiais) e as
 * datas com eventos especiais vem do Reserve Maya (MCP). O CRM fica com os
 * eventos PERSONALIZADOS e os encaminhamentos. Fora de NATIVE_TOOLS, nao
 * aparecem na tela nem chegam a IA, mesmo para quem as tinha ligado. O codigo
 * e os dados ficam, caso voltem.
 */
export const NATIVE_TOOLS_APOSENTADAS: NativeTool[] = [registrarReservaNativa, consultarEventos, registrarInscricaoEvento]

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

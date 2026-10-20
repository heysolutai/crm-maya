import { prisma } from '@/lib/db'
import { buildCapabilitiesPrompt, listCompanyTools, toFunctions, type ResolvedTool } from '@/lib/ai-tools/registry'
import { executeTool } from '@/lib/ai-tools/executor'
import { buildTestContext } from '@/lib/ai-tools/context'
import { validateArgs } from '@/lib/ai-tools/params'
import { collectPaths } from '@/lib/ai-tools/template'
import { explicarFalhaFerramenta, type FalhaFerramentaExplicada } from '@/lib/erros/ferramentas'
import { resolverChaveOpenAI } from './agente'
import { comoRecord, lerConfigMaestro } from './config'
import { historicoSimulado, type MensagemChat } from './historico'
import { quebrarResposta } from './enviar'
import { argsComoObjeto, conversar, type ChamadaTool, type ResultadoFerramenta } from './llm'
import { montarSystemPrompt } from './prompt'

/**
 * Playground do Maestro ("Testar a IA"): o MESMO prompt, modelo e ferramentas
 * do atendimento real, sem precisar de um numero de WhatsApp. Nao cria
 * conversa, mensagem nem AiTurn, e nada e enviado por WhatsApp.
 *
 *   - historico vem da tela, nao do banco;
 *   - as ferramentas do restaurante rodam DE VERDADE (pedido do restaurante:
 *     ver o dado real): consultar e reservar/cancelar no sistema externo,
 *     inscrever em evento. Usam o WhatsApp escolhido (ID do restaurante) e o
 *     "cliente do teste" (nome/telefone digitados na tela);
 *   - so e SIMULADO o que depende de uma conversa de verdade (transferir pra
 *     atendente, encaminhar pra eventos, anotar reserva no CRM);
 *   - falha de ferramenta volta explicada (src/lib/erros/ferramentas.ts).
 */

/** Ferramentas que so existem dentro de uma conversa real: no teste, simuladas. */
export const SO_EM_CONVERSA = new Set(['transferir_para_humano', 'encaminhar_para_eventos', 'registrar_reserva'])

export interface ClienteDoTeste {
  nome?: string | null
  telefone?: string | null
}

export class ErroPlayground extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'ErroPlayground'
  }
}

export interface FerramentaUsada {
  name: string
  label?: string
  args: Record<string, unknown>
  ok: boolean
  result: string
  simulated: boolean
  /** Tempo da ferramenta (ms). */
  ms: number
  /** Falha em palavras simples (null quando deu certo). */
  explicacao: FalhaFerramentaExplicada | null
  /** Texto tecnico da falha: so pro super-admin. */
  erro?: string | null
}

export interface ResultadoPlayground {
  reply: string
  /** A resposta em balões, exatamente como sai no WhatsApp (quebrarResposta). */
  partes: string[]
  tools: FerramentaUsada[]
  model: string
  ms: number
}

/** Texto de sucesso de mentira pra ferramenta que escreve. */
export function textoSimulado(tool: Pick<ResolvedTool, 'name' | 'label'>): string {
  switch (tool.name) {
    case 'transferir_para_humano':
      return '(simulação) Conversa transferida para a equipe. Avise o cliente, com educação, que um atendente vai continuar o atendimento em breve. Não responda mais nada depois disso.'
    case 'encaminhar_para_eventos':
      return '(simulação) Pedido de evento registrado. Avise o cliente que a equipe de eventos vai entrar em contato.'
    case 'registrar_reserva':
      return '(simulação) Reserva registrada. Confirme os dados com o cliente.'
  }
  if (/reserv/i.test(tool.name)) {
    return /cancel/i.test(tool.name)
      ? '(simulação) Reserva cancelada com sucesso. Confirme o cancelamento ao cliente.'
      : '(simulação) Reserva criada com sucesso (código de teste SIM-0000). Confirme os dados ao cliente.'
  }
  return `(simulação) A ação "${tool.label}" foi executada com sucesso. Nada foi feito de verdade; trate como concluída e confirme ao cliente.`
}

/** Resultado pro modelo + o erro tecnico (pra explicar na tela). */
interface Execucao {
  r: ResultadoFerramenta
  erro: string | null
  httpStatus: number | null
  sistema: string | null
  label: string
}

async function executarNoPlayground(
  c: ChamadaTool,
  ctx: {
    companyId: string
    tools: ResolvedTool[]
    inboxId: string | null
    knowledge: string | null
    cliente: ClienteDoTeste | null
  }
): Promise<Execucao> {
  const tool = ctx.tools.find((t) => t.name === c.nome)
  if (!tool) {
    return {
      r: {
        ok: false,
        texto: `A ferramenta "${c.nome}" não está disponível. Siga sem ela ou ofereça transferir para um atendente.`,
      },
      erro: 'ferramenta inexistente ou desligada',
      httpStatus: null,
      sistema: null,
      label: c.nome,
    }
  }
  const base = { sistema: tool.integration?.name ?? null, label: tool.label }

  // Mesma validacao do executor real: o ensaio tem que errar onde o real erraria.
  // Ferramenta MCP tem schema do servidor: quem valida e o executor.
  const validacao = tool.mcp
    ? ({ ok: true, args: {} } as const)
    : validateArgs(tool.parameters, argsComoObjeto(c.argsBrutos))
  if (!validacao.ok) {
    return {
      r: {
        ok: false,
        texto: `Não executei "${tool.label}": ${validacao.problems.join('; ')}. Pergunte ao cliente o que falta (ou corrija o formato) e tente de novo.`,
      },
      erro: `argumentos invalidos: ${validacao.problems.join('; ')}`,
      httpStatus: null,
      ...base,
    }
  }

  // So existe numa conversa de verdade (transferir, encaminhar, anotar no CRM).
  if (SO_EM_CONVERSA.has(tool.name)) {
    return {
      r: { ok: true, texto: textoSimulado(tool), simulada: true, encerra: tool.name === 'transferir_para_humano' },
      erro: null,
      httpStatus: null,
      ...base,
    }
  }

  // Nativa (base de conhecimento, eventos, inscricao): o executor em modo teste
  // so devolve um aviso, entao roda a ferramenta direto com o contexto de teste.
  if (tool.source === 'native' && tool.native) {
    const testCtx = await buildTestContext(ctx.companyId, {}, ctx.inboxId, ctx.cliente)
    const r = await tool.native.run({ ...testCtx, knowledge: ctx.knowledge ?? testCtx.knowledge }, validacao.args)
    return { r: { ok: r.ok, texto: r.result }, erro: r.ok ? null : r.error ?? null, httpStatus: null, ...base }
  }

  // Integracao (Reserve Maya...): roda de verdade no sistema externo, inclusive
  // reservar/cancelar. As acoes no CRM depois (anotar reserva) ficam de fora:
  // nao ha conversa.
  const r = await executeTool({
    companyId: ctx.companyId,
    conversationId: null,
    name: tool.name,
    rawArgs: c.argsBrutos,
    test: { tool, inboxId: ctx.inboxId, cliente: ctx.cliente },
  })
  return {
    r: { ok: r.ok, texto: r.result },
    erro: r.ok ? null : r.error ?? null,
    httpStatus: r.httpStatus ?? null,
    ...base,
  }
}

// ─── Agente e WhatsApp do teste ─────────────────────────────────────────────

const SELECT_AGENTE = {
  id: true,
  companyId: true,
  name: true,
  engine: true,
  isActive: true,
  prompts: true,
  behaviorSettings: true,
  apiKeys: true,
  knowledge: true,
} as const

async function carregarAgente(companyId: string, agentId: string) {
  // IDOR: o agente precisa ser desta empresa.
  const agente = await prisma.aiAgent.findFirst({ where: { id: agentId, companyId }, select: SELECT_AGENTE })
  if (!agente) throw new ErroPlayground('Este WhatsApp ainda não tem agente de IA. Abra a aba "Agente de IA" e salve as instruções.', 404)
  return agente
}

/**
 * WhatsApp usado no teste (ID do restaurante das ferramentas): o pedido pela
 * tela (validado no restaurante) ou o primeiro do agente com ID de restaurante.
 */
async function escolherInbox(companyId: string, agentId: string, inboxId: string | null | undefined) {
  if (inboxId) {
    const inbox = await prisma.inbox.findFirst({
      where: { id: inboxId, companyId },
      select: { id: true, channelConfig: true },
    })
    if (!inbox) throw new ErroPlayground('WhatsApp não encontrado.', 404)
    return inbox
  }
  const doAgente = await prisma.inbox.findMany({
    where: { companyId, aiAgentId: agentId, isActive: true },
    select: { id: true, channelConfig: true },
    orderBy: { createdAt: 'asc' },
  })
  return doAgente.find((i) => !!idDoRestaurante(i.channelConfig)) ?? doAgente[0] ?? null
}

function idDoRestaurante(channelConfig: unknown): string | null {
  const id = comoRecord(channelConfig).restaurantId
  return typeof id === 'string' && id.trim() ? id.trim() : null
}

// ─── Pronto pra testar? ─────────────────────────────────────────────────────

export interface ProntidaoPlayground {
  pronto: boolean
  /** O que impede o teste (null = pode testar). */
  bloqueio: { titulo: string; oQueFazer: string } | null
  /** Avisos que nao impedem (ex: falta o ID do restaurante pras reservas). */
  avisos: string[]
  modelo: string
  /** simulada = so numa conversa real; altera = muda dado (reserva, inscricao...). */
  ferramentas: { nome: string; label: string; simulada: boolean; altera: boolean }[]
  /** Motor que atende os clientes deste WhatsApp hoje ('n8n' | 'maestro'). */
  motor: string
  /** Prompt completo que a IA recebe (so pro super-admin conferir). */
  prompt?: string
}

export async function prontidaoPlayground(p: {
  companyId: string
  agentId: string
  inboxId?: string | null
  superAdmin?: boolean
}): Promise<ProntidaoPlayground> {
  const agente = await carregarAgente(p.companyId, p.agentId)
  const [chave, inbox, tools, empresa] = await Promise.all([
    resolverChaveOpenAI(agente, p.companyId),
    escolherInbox(p.companyId, agente.id, p.inboxId),
    listCompanyTools(p.companyId, { agentId: agente.id }),
    p.superAdmin
      ? prisma.company.findFirst({ where: { id: p.companyId }, select: { name: true, tradeName: true } })
      : Promise.resolve(null),
  ])
  const config = lerConfigMaestro(agente)

  const avisos: string[] = []
  if (!agente.isActive) {
    avisos.push('A IA está desligada para os clientes deste WhatsApp. O teste funciona mesmo assim; para ela atender, ligue "IA atendendo" na aba "Agente de IA".')
  }
  const caminhos = new Set<string>()
  for (const t of tools) {
    if (t.source !== 'integration' || !t.http) continue
    collectPaths(t.http.path, caminhos)
    collectPaths(t.http.bodyTemplate, caminhos)
  }
  if (caminhos.has('inbox.restaurant_id') && !idDoRestaurante(inbox?.channelConfig)) {
    avisos.push(
      'Este WhatsApp está sem o ID do restaurante: no teste, a IA não vai conseguir consultar horários. Preencha em "Agente de IA" > "Ferramentas".'
    )
  }

  return {
    pronto: !!chave,
    bloqueio: chave
      ? null
      : {
          titulo: 'A IA ainda não tem acesso liberado',
          oQueFazer: 'Falta a chave da OpenAI. Cadastre em "Agente de IA" > "Provedores" ou peça ao suporte para liberar.',
        },
    avisos,
    modelo: config.modelo,
    ferramentas: tools.map((t) => ({ nome: t.name, label: t.label, simulada: SO_EM_CONVERSA.has(t.name), altera: t.isWrite })),
    motor: agente.engine,
    ...(p.superAdmin
      ? {
          prompt: montarSystemPrompt({
            config,
            empresaNome: empresa?.tradeName || empresa?.name || '',
            clienteNome: 'Cliente Teste',
            codigoConversa: null,
            capacidades: buildCapabilitiesPrompt(tools),
          }),
        }
      : {}),
  }
}

// ─── Uma rodada do teste ────────────────────────────────────────────────────

export async function simularTurno(p: {
  companyId: string
  agentId: string
  inboxId?: string | null
  messages: { role: 'user' | 'assistant'; content: string }[]
  superAdmin?: boolean
  cliente?: ClienteDoTeste | null
}): Promise<ResultadoPlayground> {
  const inicio = Date.now()
  const agente = await carregarAgente(p.companyId, p.agentId)

  const historico: MensagemChat[] = historicoSimulado(p.messages)
  if (historico.length === 0 || historico[historico.length - 1].role !== 'user') {
    throw new ErroPlayground('A conversa de teste precisa terminar com uma mensagem do cliente.', 400)
  }

  const apiKey = await resolverChaveOpenAI(agente, p.companyId)
  if (!apiKey) {
    throw new ErroPlayground(
      'A IA ainda não tem acesso liberado: falta a chave da OpenAI. Cadastre em "Agente de IA" > "Provedores" ou peça ao suporte.',
      422
    )
  }

  const config = lerConfigMaestro(agente)
  const [empresa, inbox, tools] = await Promise.all([
    prisma.company.findFirst({ where: { id: p.companyId }, select: { name: true, tradeName: true } }),
    escolherInbox(p.companyId, agente.id, p.inboxId),
    listCompanyTools(p.companyId, { agentId: agente.id }),
  ])
  const inboxId = inbox?.id ?? null

  const system = montarSystemPrompt({
    config,
    empresaNome: empresa?.tradeName || empresa?.name || '',
    clienteNome: p.cliente?.nome?.trim() || 'Cliente Teste',
    codigoConversa: null,
    capacidades: buildCapabilitiesPrompt(tools),
  })

  // Uma entrada por chamada, na ordem em que o modelo pede (o llm executa uma
  // de cada vez e registra na mesma ordem): e assim que a explicacao casa.
  const execucoes: (Execucao | null)[] = []
  const conversa = await conversar({
    apiKey,
    modelo: config.modelo,
    temperatura: config.temperatura,
    system,
    historico,
    tools: toFunctions(tools),
    executar: async (c) => {
      let e: Execucao | null = null
      try {
        e = await executarNoPlayground(c, {
          companyId: p.companyId,
          tools,
          inboxId,
          knowledge: agente.knowledge,
          cliente: p.cliente ?? null,
        })
        return e.r
      } finally {
        execucoes.push(e)
      }
    },
  })

  const rotulos = new Map(tools.map((t) => [t.name, t.label]))
  const reply = conversa.texto || (conversa.encerrou ? config.mensagemErro : '')
  if (!reply) throw new ErroPlayground('A IA não gerou resposta. Tente escrever a mensagem de outro jeito.', 502)

  const partes = quebrarResposta(reply)
  return {
    reply,
    partes: partes.length ? partes : [reply],
    tools: conversa.chamadas.map((c, i) => {
      const e = execucoes[i] ?? null
      const label = rotulos.get(c.nome) ?? e?.label
      const erro = c.ok ? null : e?.erro ?? 'erro desconhecido'
      return {
        name: c.nome,
        label,
        args: c.args,
        ok: c.ok,
        result: c.resultado,
        simulated: c.simulada,
        ms: c.ms,
        explicacao: c.ok
          ? null
          : explicarFalhaFerramenta({ error: erro, httpStatus: e?.httpStatus, sistema: e?.sistema, ferramenta: label }),
        ...(p.superAdmin ? { erro } : {}),
      }
    }),
    model: config.modelo,
    ms: Date.now() - inicio,
  }
}

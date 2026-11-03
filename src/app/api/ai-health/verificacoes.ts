import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { resolveOpenAiKey } from '@/lib/ai/embeddings'
import { ESPERA_RESPOSTA_DA_IA, SEM_RESPOSTA_APOS_MS } from '@/lib/ai/motivos'
import { falhasRecentesDeFerramentas, quandoFoi } from '@/lib/ai-tools/falhas'
import { enabledNativeNames } from '@/lib/ai-tools/native'
import { parseConfigFields } from '@/lib/ai-tools/secrets'
import { collectPaths } from '@/lib/ai-tools/template'
import { explicarErroConexao } from '@/lib/erros/envio'
import { getSystemSetting } from '@/lib/system-settings'
import { asRecord, friendlyTestMessage } from '@/app/api/integrations/shared'
import type { ItemSituacao } from '@/components/situacao/types'

/**
 * Verificacoes do painel "Situacao" (GET /api/ai-health). Cada uma olha UMA
 * coisa que faz a IA parar de atender e devolve itens ja em palavras simples.
 *
 * Regras: so contagens e campos pequenos (roda a cada minuto por tela aberta);
 * tudo escopado por companyId; nenhuma devolve segredo (chave da IA, URL do
 * fluxo). Texto e pro cliente final: conexao pelo nome, nunca ID nem nome de
 * campo interno.
 */

const DIA_MS = 24 * 60 * 60 * 1000

export interface InboxVerificada {
  id: string
  displayName: string | null
  instanceName: string
  status: string | null
  errorMessage: string | null
  aiAgentId: string | null
  channelConfig: Prisma.JsonValue
}

export const SELECT_INBOX = {
  id: true,
  displayName: true,
  instanceName: true,
  status: true,
  errorMessage: true,
  aiAgentId: true,
  channelConfig: true,
} as const

export interface Contexto {
  companyId: string
  /** WhatsApp verificados: o pedido (inboxId) ou todos os ativos. */
  inboxes: InboxVerificada[]
  /** Painel de UMA conexao (aba Agente de IA): textos falam "desta conexão". */
  inboxUnica: string | null
}

export type Verificacao = (ctx: Contexto) => Promise<ItemSituacao[]>

/** Conexão "Loja Centro": o nome que o restaurante deu. */
function conexaoNomeada(inbox: InboxVerificada): string {
  return `conexão "${inbox.displayName?.trim() || inbox.instanceName}"`
}

/** "desta conexão" na tela da propria conexao; 'da conexão "Fulano"' no Dashboard. */
function daConexao(ctx: Contexto, inbox: InboxVerificada): string {
  return ctx.inboxUnica ? 'desta conexão' : `da ${conexaoNomeada(inbox)}`
}

function maiuscula(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function plural(n: number, um: string, varios: string): string {
  return n === 1 ? um : varios.replace('#', String(n))
}

const SUPORTE = { label: 'Falar com o suporte', href: '/app/support' }

// ─── a. WhatsApp desconectado ───────────────────────────────────────────────

const conexao: Verificacao = async (ctx) =>
  ctx.inboxes
    .filter((inbox) => inbox.status !== 'connected')
    .map((inbox) => {
      const e = explicarErroConexao(inbox.errorMessage)
      const motivo = inbox.errorMessage?.trim() ? e.motivo : 'O WhatsApp não está ligado ao sistema.'
      return {
        id: `conexao:${inbox.id}`,
        nivel: 'problema' as const,
        titulo: `${maiuscula(conexaoNomeada(inbox))} desconectada`,
        detalhe: `${motivo} Enquanto isso, as mensagens dos clientes não chegam e a IA não responde por ela.`,
        oQueFazer: inbox.errorMessage?.trim()
          ? e.oQueFazer
          : `Abra a ${conexaoNomeada(inbox)} em Conexões e conecte de novo (QR Code ou botão Conectar).`,
        acao: { label: 'Conectar', href: `/app/inboxes/${inbox.id}` },
      }
    })

// ─── b. Agente de IA do WhatsApp ────────────────────────────────────────────

const SELECT_AGENTE = { id: true, name: true, engine: true, isActive: true, apiKeys: true, n8nWebhookUrl: true } as const

const agente: Verificacao = async (ctx) => {
  if (ctx.inboxes.length === 0) return []

  // Mesma regra do atendimento (src/lib/maestro/agente.ts): o agente ligado ao
  // WhatsApp; sem agente ligado, o primeiro agente ativo do restaurante.
  const ids = [...new Set(ctx.inboxes.map((i) => i.aiAgentId).filter((id): id is string => !!id))]
  const precisaPadrao = ctx.inboxes.some((i) => !i.aiAgentId)
  const [vinculados, padrao] = await Promise.all([
    ids.length
      ? prisma.aiAgent.findMany({ where: { companyId: ctx.companyId, id: { in: ids } }, select: SELECT_AGENTE })
      : Promise.resolve([]),
    precisaPadrao
      ? prisma.aiAgent.findFirst({
          where: { companyId: ctx.companyId, isActive: true },
          orderBy: { createdAt: 'asc' },
          select: SELECT_AGENTE,
        })
      : Promise.resolve(null),
  ])
  const porId = new Map(vinculados.map((a) => [a.id, a]))

  // Padroes do sistema: lidos uma vez so e so se alguem precisar.
  let chavePadrao: Promise<boolean> | null = null
  const temChavePadrao = () =>
    (chavePadrao ??= resolveOpenAiKey(ctx.companyId).then((k) => !!k?.trim()))
  let fluxoPadrao: Promise<boolean> | null = null
  const temFluxoPadrao = () =>
    (fluxoPadrao ??= getSystemSetting('n8n_ai_webhook_url').then((u) => !!u?.trim()))

  const itens: ItemSituacao[] = []
  for (const inbox of ctx.inboxes) {
    const a = inbox.aiAgentId ? porId.get(inbox.aiAgentId) ?? null : padrao
    const de = daConexao(ctx, inbox)

    if (a && !a.isActive) {
      itens.push({
        id: `ia_desligada:${inbox.id}`,
        nivel: 'aviso',
        titulo: `A IA ${de} está desligada`,
        detalhe: 'A IA não responde os clientes desta conexão: só a equipe atende.',
        oQueFazer: 'Se a IA deveria estar atendendo, ligue a chave "IA atendendo" no topo da aba "Agente de IA" desta conexão.',
        acao: { label: 'Ligar a IA', href: `/app/inboxes/${inbox.id}` },
      })
      continue
    }

    if (a?.engine === 'maestro') {
      const propria = asRecord(a.apiKeys).openai
      const temPropria = typeof propria === 'string' && propria.trim().length > 0
      if (!temPropria && !(await temChavePadrao())) {
        itens.push({
          id: `ia_sem_acesso:${inbox.id}`,
          nivel: 'problema',
          titulo: `A IA ${de} está sem acesso e não consegue responder`,
          detalhe: 'O serviço de IA não está liberado para este restaurante. Os clientes que escrevem ficam sem resposta da IA.',
          oQueFazer: 'Fale com o suporte para liberar o acesso da IA. Enquanto isso, responda os clientes pela tela de Atendimentos.',
          acao: SUPORTE,
        })
      }
      continue
    }

    // n8n (ou nenhum agente: o atendimento cai no fluxo padrao do sistema).
    const temProprio = !!a?.n8nWebhookUrl?.trim()
    if (!temProprio && !(await temFluxoPadrao())) {
      itens.push({
        id: `ia_nao_ligada:${inbox.id}`,
        nivel: 'problema',
        titulo: `A IA ${de} não está ligada`,
        detalhe: 'A IA ainda não foi ativada para esta conexão, então ela não responde os clientes.',
        oQueFazer: 'Fale com o suporte para ligar a IA nesta conexão. Enquanto isso, responda os clientes pela tela de Atendimentos.',
        acao: SUPORTE,
      })
    }
  }
  return itens
}

// ─── c. Mensagens que a IA nao respondeu (24h) ──────────────────────────────

function linkRegistro(ctx: Contexto): string {
  const params = new URLSearchParams({ filtro: 'problemas' })
  if (ctx.inboxUnica) params.set('inboxId', ctx.inboxUnica)
  return `/app/ai-registro?${params.toString()}`
}

const respostasDaIA: Verificacao = async (ctx) => {
  const agora = Date.now()
  const base: Prisma.AiTurnWhereInput = {
    companyId: ctx.companyId,
    ...(ctx.inboxUnica ? { conversation: { companyId: ctx.companyId, inboxId: ctx.inboxUnica } } : {}),
  }
  const [erros, semResposta] = await Promise.all([
    prisma.aiTurn.count({ where: { ...base, status: 'erro', createdAt: { gte: new Date(agora - DIA_MS) } } }),
    prisma.aiTurn.count({
      where: {
        ...base,
        ...ESPERA_RESPOSTA_DA_IA,
        createdAt: { gte: new Date(agora - DIA_MS), lt: new Date(agora - SEM_RESPOSTA_APOS_MS) },
        // IA desligada nao responde de proposito: o aviso "IA desligada" ja conta a historia.
        NOT: { conversation: { inbox: { aiAgent: { isActive: false } } } },
      },
    }),
  ])

  const acao = { label: 'Ver quais', href: linkRegistro(ctx) }
  const itens: ItemSituacao[] = []
  if (erros > 0) {
    itens.push({
      id: 'ia_erros_24h',
      nivel: 'problema',
      titulo: plural(
        erros,
        '1 mensagem que a IA não conseguiu responder (últimas 24h)',
        '# mensagens que a IA não conseguiu responder (últimas 24h)'
      ),
      detalhe: 'A IA tentou responder, mas algo deu errado. Esses clientes podem estar esperando uma resposta.',
      oQueFazer: 'Veja quais foram e responda quem ainda está esperando. Se continuar acontecendo, fale com o suporte.',
      acao,
    })
  }
  if (semResposta > 0) {
    itens.push({
      id: 'ia_sem_resposta_24h',
      nivel: 'aviso',
      titulo: plural(semResposta, '1 mensagem ficou sem resposta da IA', '# mensagens ficaram sem resposta da IA'),
      detalhe: 'Nas últimas 24 horas, a IA recebeu essas mensagens, mas não respondeu em 10 minutos.',
      oQueFazer: 'Veja quais foram e responda quem ainda está esperando. Se continuar acontecendo, fale com o suporte.',
      acao,
    })
  }
  return itens
}

// ─── d. Mensagens que nao chegaram ao cliente (24h) ─────────────────────────

const entregas: Verificacao = async (ctx) => {
  // created_at e timestamp sem fuso gravado em UTC (padrao do Prisma): a janela
  // e calculada no proprio banco pra nao depender do fuso da conexao.
  const desde = Prisma.sql`(NOW() AT TIME ZONE 'UTC') - INTERVAL '24 hours'`
  const filtroInbox = ctx.inboxUnica ? Prisma.sql`AND c.inbox_id = ${ctx.inboxUnica}::uuid` : Prisma.empty
  // Falha de envio fica marcada na mensagem (read_status ou metadata, ver
  // src/lib/erros/envio.ts falhaDaMensagem). Envio que deu certo depois
  // reescreve a metadata, entao nao conta.
  const falhou = Prisma.sql`(
    m.read_status = 'failed'
    OR NULLIF(m.metadata->>'send_error', '') IS NOT NULL
    OR NULLIF(m.metadata->>'whatsapp_error', '') IS NOT NULL
  )`
  const linhas = await prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
    SELECT COUNT(*)::int AS total
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.company_id = ${ctx.companyId}::uuid
      AND m.created_at >= ${desde}
      AND m.sender_type <> 'client'
      AND ${falhou}
      ${filtroInbox}
  `)
  const total = Number(linhas[0]?.total ?? 0)
  if (total === 0) return []

  return [
    {
      id: 'envio_falhou_24h',
      nivel: 'problema',
      titulo: plural(total, '1 mensagem não foi entregue ao cliente', '# mensagens não foram entregues aos clientes'),
      detalhe: 'Nas últimas 24 horas, essas mensagens não saíram pelo WhatsApp, então os clientes não receberam.',
      oQueFazer:
        'Abra as conversas, procure as mensagens marcadas como não entregues e envie de novo. Se continuar, confira se a conexão está conectada.',
      acao: { label: 'Ver conversas', href: '/app/conversations' },
    },
  ]
}

// ─── e. Integracoes (ID do restaurante e ultimo teste) ──────────────────────

function restaurantIdDe(inbox: InboxVerificada): string | null {
  const v = asRecord(inbox.channelConfig).restaurantId
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

const integracoes: Verificacao = async (ctx) => {
  const ativas = await prisma.companyIntegration.findMany({
    where: { companyId: ctx.companyId, enabled: true, integration: { isActive: true } },
    select: {
      enabledTools: true,
      lastTestOk: true,
      lastError: true,
      integration: {
        select: {
          slug: true,
          name: true,
          configFields: true,
          tools: { where: { isActive: true }, select: { name: true, path: true, bodyTemplate: true } },
        },
      },
    },
  })

  const itens: ItemSituacao[] = []
  const usamIdDoRestaurante: string[] = []
  // Onde o restaurante confere e testa: Agente de IA > Ferramentas de uma conexao.
  const ondeTestar = ctx.inboxes[0] ? `/app/inboxes/${ctx.inboxes[0].id}` : '/app/inboxes'

  for (const ci of ativas) {
    const ligadas = ci.integration.tools.filter((t) => ci.enabledTools.includes(t.name))
    if (ligadas.length === 0) continue // ligada sem nada pra IA usar: nao afeta o atendimento

    const caminhos = new Set<string>()
    for (const t of ligadas) {
      collectPaths(t.path, caminhos)
      collectPaths(t.bodyTemplate, caminhos)
    }
    if (caminhos.has('inbox.restaurant_id')) usamIdDoRestaurante.push(ci.integration.name)

    if (ci.lastTestOk === false) {
      itens.push({
        id: `integracao_teste:${ci.integration.slug}`,
        nivel: 'aviso',
        titulo: `O último teste da ${ci.integration.name} falhou`,
        detalhe: friendlyTestMessage(false, ci.lastError, parseConfigFields(ci.integration.configFields), ci.integration.name),
        oQueFazer:
          'Em "Agente de IA" > "Ferramentas" da conexão, corrija o que faltar e clique em "Testar conexão" de novo. Se continuar falhando, fale com o suporte.',
        acao: { label: 'Abrir', href: ondeTestar },
      })
    }
  }

  if (usamIdDoRestaurante.length) {
    const nomes = usamIdDoRestaurante.join(', ')
    for (const inbox of ctx.inboxes) {
      if (restaurantIdDe(inbox)) continue
      itens.unshift({
        id: `integracao_sem_id:${inbox.id}`,
        nivel: 'problema',
        titulo: `${maiuscula(conexaoNomeada(inbox))} sem o ID do restaurante`,
        detalhe: `Sem esse número, a IA não consegue usar ${nomes} com os clientes desta conexão.`,
        oQueFazer: `Abra a ${conexaoNomeada(inbox)}, vá em "Agente de IA" > "Ferramentas" e preencha o campo "ID do restaurante deste WhatsApp". Se não souber o número, fale com o suporte.`,
        acao: { label: 'Preencher', href: `/app/inboxes/${inbox.id}` },
      })
    }
  }
  return itens
}

// ─── f. Ferramentas da IA que falharam (24h) ────────────────────────────────

/** Falhas que o restaurante mesmo resolve na tela do WhatsApp. */
const RESOLVE_NA_TELA = new Set(['nao_configurada', 'id_errado', 'desligada', 'base_vazia'])
/** Falhas em que vale abrir a conversa (o cliente pode estar esperando). */
const VER_CONVERSA = new Set(['fora_do_ar', 'limite', 'desconhecido'])

const ferramentas: Verificacao = async (ctx) => {
  const grupos = await falhasRecentesDeFerramentas(ctx.companyId, {
    desde: new Date(Date.now() - DIA_MS),
    inboxId: ctx.inboxUnica,
  })

  const itens: ItemSituacao[] = []
  for (const g of grupos) {
    const e = g.explicacao
    // Falta do ID do restaurante ja tem item proprio (integracoes), olhando o
    // estado ATUAL: se ja foi preenchido, a falha antiga nao precisa aparecer.
    if (e.codigo === 'nao_configurada' && e.titulo.startsWith('Falta o ID')) continue

    const inbox = g.ultimaInbox ?? ctx.inboxes[0]?.id ?? null
    const acao = RESOLVE_NA_TELA.has(e.codigo)
      ? { label: 'Abrir', href: inbox ? `/app/inboxes/${inbox}` : '/app/inboxes' }
      : VER_CONVERSA.has(e.codigo) && g.ultimaConversa
        ? { label: 'Ver conversa', href: `/app/conversations?conversation=${g.ultimaConversa}` }
        : SUPORTE

    const acoes = g.ferramentas.length ? ` ${plural(g.ferramentas.length, 'Ação', 'Ações')}: ${g.ferramentas.join(', ')}.` : ''
    itens.push({
      id: `ferramenta:${g.chave}`,
      nivel: e.nivel === 'problema' ? 'problema' : 'aviso',
      titulo: `${e.titulo} (${plural(g.vezes, '1 vez', '# vezes')} nas últimas 24h)`,
      detalhe: `${e.motivo}${acoes} Última vez: ${quandoFoi(g.ultimaEm)}.`,
      oQueFazer: e.oQueFazer ?? 'Não precisa fazer nada.',
      acao,
    })
  }
  return itens
}

// ─── g. Eventos ligados sem evento cadastrado ───────────────────────────────

const FERRAMENTAS_EVENTO = ['consultar_eventos', 'registrar_inscricao_evento']

function inicioDeHojeSaoPaulo(): Date {
  const dia = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) // AAAA-MM-DD
  return new Date(`${dia}T00:00:00-03:00`)
}

const eventos: Verificacao = async (ctx) => {
  const company = await prisma.company.findUnique({ where: { id: ctx.companyId }, select: { settings: true } })
  const ligadas = enabledNativeNames(company?.settings)
  if (!ligadas.some((n) => FERRAMENTAS_EVENTO.includes(n))) return []

  // Mesmo criterio da IA (src/lib/ai-tools/eventos.ts): ativo e ainda nao passou.
  const futuros = await prisma.specialEvent.count({
    where: {
      companyId: ctx.companyId,
      isActive: true,
      OR: [{ eventDate: null }, { eventDate: { gte: inicioDeHojeSaoPaulo() } }],
    },
  })
  if (futuros > 0) return []

  return [
    {
      id: 'eventos_sem_cadastro',
      nivel: 'aviso',
      titulo: 'Nenhum próximo evento cadastrado',
      detalhe: 'Os eventos estão ligados para a IA, mas se um cliente perguntar, ela vai responder que não há nenhum.',
      oQueFazer:
        'Cadastre os próximos eventos do restaurante. Se não tiver eventos agora, desligue as opções de eventos em "Agente de IA" > "Ferramentas".',
      acao: { label: 'Cadastrar evento', href: '/app/events' },
    },
  ]
}

/** Na ordem em que aparecem na tela (problemas sobem depois, na rota). */
export const VERIFICACOES: { nome: string; rodar: Verificacao }[] = [
  { nome: 'conexao', rodar: conexao },
  { nome: 'agente', rodar: agente },
  { nome: 'respostas_ia', rodar: respostasDaIA },
  { nome: 'entregas', rodar: entregas },
  { nome: 'integracoes', rodar: integracoes },
  { nome: 'ferramentas', rodar: ferramentas },
  { nome: 'eventos', rodar: eventos },
]

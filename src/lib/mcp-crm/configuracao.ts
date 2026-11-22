import { Prisma, type CompanyFaq, type HandoffRule } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { indexFaq, unindexFaq } from '@/lib/ai/faq-indexer'
import { camposDaRegra, chaveDaRegra, telefonesSchema } from '@/lib/solicitacoes/api'
import { listarRegras } from '@/lib/solicitacoes/servico'
import { limparCacheEquipe } from '@/lib/solicitacoes/avisos'
import { enabledNativeNames, NATIVE_TOOLS, NATIVE_TOOL_NAMES } from '@/lib/ai-tools/native'
import { listCompanyTools, modoDe } from '@/lib/ai-tools/registry'

/**
 * Configuracao do restaurante que o MCP do Hermes altera: base de
 * conhecimento, regras de encaminhamento (eventos e atendimento humano) e
 * ferramentas nativas. Rotas em /api/mcp-config.
 *
 * Toda alteracao segue o mesmo caminho:
 *   1. `simular` (padrao): devolve o antes e o depois sem gravar;
 *   2. aplicada, exige a `versao` lida (se o registro mudou no meio, recusa);
 *   3. grava o registro e a ConfigChange (antes/depois/motivo) na mesma
 *      transacao; `desfazerAlteracao` volta usando o `antes`.
 *
 * Validacao igual a da tela (camposDaRegra, telefonesSchema): o MCP nao
 * consegue gravar o que a tela recusaria. Tudo filtrado por companyId.
 */

/** Erro com frase pronta pro Hermes (validacao, conflito): a rota devolve como esta. */
export class ErroConfig extends Error {
  constructor(
    message: string,
    public status: 400 | 404 | 409 = 400
  ) {
    super(message)
  }
}

export interface ResultadoAlteracao {
  simulado: boolean
  entidade: 'faq' | 'regra' | 'ferramentas'
  acao: string
  id: string | null
  antes: Record<string, unknown> | null
  depois: Record<string, unknown> | null
  /** Id da ConfigChange (so quando aplicada): e o que desfazer_alteracao recebe. */
  alteracaoId?: string
  /** Versao nova do registro (para a proxima alteracao). */
  versao?: string
}

const versaoDe = (d: Date) => d.toISOString()

/** JSON com chaves ordenadas: o jsonb do Postgres reordena as chaves ao gravar. */
function estavel(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(estavel).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${estavel(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v ?? null)
}

const iguais = (a: unknown, b: unknown) => estavel(a) === estavel(b)

function comoRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

const json = (v: unknown) => v as Prisma.InputJsonValue

/** Filtro "settings continua como foi lido" (settings pode ser null no banco). */
const settingsIguais = (lidos: Prisma.JsonValue) =>
  lidos === null ? { equals: Prisma.DbNull } : { equals: lidos as Prisma.InputJsonValue }

// ─── Base de conhecimento ────────────────────────────────────────────────

export interface FotoFaq {
  pergunta: string
  resposta: string
  categoria: string | null
  palavrasChave: string[]
  ativa: boolean
}

function fotoFaq(f: Pick<CompanyFaq, 'question' | 'answer' | 'category' | 'keywords' | 'isActive'>): FotoFaq {
  return {
    pergunta: f.question,
    resposta: f.answer,
    categoria: f.category ?? null,
    palavrasChave: f.keywords,
    ativa: f.isActive,
  }
}

export async function listarFaq(companyId: string) {
  const faqs = await prisma.companyFaq.findMany({ where: { companyId }, orderBy: { orderPosition: 'asc' } })
  return faqs.map((f) => ({ id: f.id, versao: versaoDe(f.updatedAt), ...fotoFaq(f) }))
}

const pergunta = z.string().trim().min(3, 'Pergunta curta demais').max(500)
const resposta = z.string().trim().min(1, 'Informe a resposta').max(4000)
const categoria = z.string().trim().max(100).nullable()
const palavrasChave = z.array(z.string().trim().min(1).max(50)).max(20)

export const alterarFaqSchema = z.object({
  motivo: z.string().trim().min(3).max(300),
  simular: z.boolean().default(true),
  alteracao: z.discriminatedUnion('acao', [
    z.object({
      acao: z.literal('criar'),
      pergunta,
      resposta,
      categoria: categoria.optional(),
      palavras_chave: palavrasChave.optional(),
      ativa: z.boolean().optional(),
    }),
    z.object({
      acao: z.literal('editar'),
      id: z.string().uuid(),
      versao: z.string().min(10).max(40),
      pergunta: pergunta.optional(),
      resposta: resposta.optional(),
      categoria: categoria.optional(),
      palavras_chave: palavrasChave.optional(),
      ativa: z.boolean().optional(),
    }),
    z.object({ acao: z.literal('apagar'), id: z.string().uuid(), versao: z.string().min(10).max(40) }),
  ]),
})
export type EntradaFaq = z.infer<typeof alterarFaqSchema>

/** FAQ do restaurante na versao lida; senao, erro com o motivo. */
async function faqNaVersao(companyId: string, id: string, versao: string): Promise<CompanyFaq> {
  const faq = await prisma.companyFaq.findFirst({ where: { id, companyId } })
  if (!faq) throw new ErroConfig('Pergunta não encontrada neste restaurante. Use listar_base_conhecimento.', 404)
  if (versaoDe(faq.updatedAt) !== versao) {
    throw new ErroConfig('Esta pergunta mudou depois da sua leitura. Leia de novo e refaça em cima do texto atual.', 409)
  }
  return faq
}

export async function alterarFaq(companyId: string, e: EntradaFaq): Promise<ResultadoAlteracao> {
  const a = e.alteracao

  if (a.acao === 'criar') {
    const depois: FotoFaq = {
      pergunta: a.pergunta,
      resposta: a.resposta,
      categoria: a.categoria ?? null,
      palavrasChave: a.palavras_chave ?? [],
      ativa: a.ativa ?? true,
    }
    if (e.simular) return { simulado: true, entidade: 'faq', acao: 'criar', id: null, antes: null, depois: { ...depois } }

    const ultima = await prisma.companyFaq.findFirst({
      where: { companyId },
      orderBy: { orderPosition: 'desc' },
      select: { orderPosition: true },
    })
    const { faq, mudanca } = await prisma.$transaction(async (tx) => {
      const faq = await tx.companyFaq.create({
        data: {
          companyId,
          question: depois.pergunta,
          answer: depois.resposta,
          category: depois.categoria,
          keywords: depois.palavrasChave,
          isActive: depois.ativa,
          orderPosition: (ultima?.orderPosition ?? -1) + 1,
        },
      })
      const mudanca = await tx.configChange.create({
        data: { companyId, entity: 'faq', entityId: faq.id, action: 'criar', after: json(depois), reason: e.motivo },
      })
      return { faq, mudanca }
    })
    await indexFaq(companyId, faq)
    return { simulado: false, entidade: 'faq', acao: 'criar', id: faq.id, antes: null, depois: { ...depois }, alteracaoId: mudanca.id, versao: versaoDe(faq.updatedAt) }
  }

  const atual = await faqNaVersao(companyId, a.id, a.versao)
  const antes = fotoFaq(atual)

  if (a.acao === 'apagar') {
    if (e.simular) return { simulado: true, entidade: 'faq', acao: 'apagar', id: atual.id, antes: { ...antes }, depois: null }
    const mudanca = await prisma.$transaction(async (tx) => {
      const apagados = await tx.companyFaq.deleteMany({ where: { id: atual.id, companyId, updatedAt: atual.updatedAt } })
      if (apagados.count === 0) throw new ErroConfig('A pergunta mudou enquanto a alteração era gravada. Leia de novo.', 409)
      return tx.configChange.create({
        data: { companyId, entity: 'faq', entityId: atual.id, action: 'apagar', before: json(antes), reason: e.motivo },
      })
    })
    await unindexFaq(companyId, atual.id)
    return { simulado: false, entidade: 'faq', acao: 'apagar', id: atual.id, antes: { ...antes }, depois: null, alteracaoId: mudanca.id }
  }

  const depois: FotoFaq = {
    pergunta: a.pergunta ?? antes.pergunta,
    resposta: a.resposta ?? antes.resposta,
    categoria: a.categoria !== undefined ? a.categoria : antes.categoria,
    palavrasChave: a.palavras_chave ?? antes.palavrasChave,
    ativa: a.ativa ?? antes.ativa,
  }
  if (iguais(antes, depois)) throw new ErroConfig('Os valores enviados são iguais aos atuais. Nada foi alterado.')
  if (e.simular) return { simulado: true, entidade: 'faq', acao: 'editar', id: atual.id, antes: { ...antes }, depois: { ...depois } }

  const { faq, mudanca } = await gravarFaq(companyId, atual, depois, 'editar', e.motivo)
  await indexFaq(companyId, faq)
  return { simulado: false, entidade: 'faq', acao: 'editar', id: faq.id, antes: { ...antes }, depois: { ...depois }, alteracaoId: mudanca.id, versao: versaoDe(faq.updatedAt) }
}

/** Grava a foto `depois` num FAQ que ainda esta como foi lido, com a ConfigChange. */
async function gravarFaq(companyId: string, atual: CompanyFaq, depois: FotoFaq, acao: string, motivo: string) {
  return prisma.$transaction(async (tx) => {
    const n = await tx.companyFaq.updateMany({
      where: { id: atual.id, companyId, updatedAt: atual.updatedAt },
      data: {
        question: depois.pergunta,
        answer: depois.resposta,
        category: depois.categoria,
        keywords: depois.palavrasChave,
        isActive: depois.ativa,
      },
    })
    if (n.count === 0) throw new ErroConfig('A pergunta mudou enquanto a alteração era gravada. Leia de novo.', 409)
    const faq = await tx.companyFaq.findFirstOrThrow({ where: { id: atual.id, companyId } })
    const mudanca = await tx.configChange.create({
      data: { companyId, entity: 'faq', entityId: atual.id, action: acao, before: json(fotoFaq(atual)), after: json(depois), reason: motivo },
    })
    return { faq, mudanca }
  })
}

// ─── Regras de encaminhamento ────────────────────────────────────────────

/**
 * Campos de uma regra, com o nome do MCP e para que serve. A tela de Regras
 * (CRM > Regras) usa os mesmos campos; os limites vem de camposDaRegra.
 */
export const GUIA_REGRA: { nome: string; campo: keyof HandoffRule; explicacao: string }[] = [
  { nome: 'nome', campo: 'name', explicacao: 'Nome da categoria (aparece no CRM e no aviso). 2 a 60 caracteres. Ex.: "Casamento".' },
  { nome: 'etiqueta', campo: 'tag', explicacao: 'Etiqueta aplicada na conversa (filtro em Atendimentos). 2 a 60 caracteres.' },
  { nome: 'quando_usar', campo: 'trigger', explicacao: 'GATILHO: quando a IA usa esta regra, em linguagem natural. Seja específico. 10 a 1000 caracteres.' },
  { nome: 'quando_nao_usar', campo: 'notWhen', explicacao: 'NÃO-GATILHO: o que parece, mas não é (evita encaminhar errado). Ex.: "Reserva de mesa para aniversário sem estrutura é reserva normal". Até 1000.' },
  { nome: 'exemplos', campo: 'examples', explicacao: 'Frases de cliente que disparam a regra (até 10, 200 caracteres cada).' },
  { nome: 'dados_a_coletar', campo: 'collectFields', explicacao: 'O que a IA pede antes de encaminhar (até 8, 60 caracteres cada). Vai numa mensagem só, em lista numerada; depois ela pede só o que faltar.' },
  { nome: 'frase_pedido_dados', campo: 'askMessage', explicacao: 'Frase que abre o pedido de dados, antes da lista, no tom da casa (vazio = a padrão). Até 500.' },
  { nome: 'caminho', campo: 'flowMode', explicacao: '"coletar" = pede os dados direto. "apresentar" = manda primeiro a apresentação (texto e, se houver, fotos) e depois pede os dados.' },
  { nome: 'apresentacao', campo: 'introMessage', explicacao: 'Texto enviado antes das perguntas no caminho "apresentar". Vai exatamente como escrito. Até 1000.' },
  { nome: 'fotos', campo: 'introImages', explicacao: 'Fotos da apresentação (até 5, endereços https). Só no caminho "apresentar"; sem fotos, vai só o texto.' },
  { nome: 'resposta_final', campo: 'responseMessage', explicacao: 'O que a IA diz ao cliente depois de encaminhar, com a identidade da casa. Variáveis: {nome}, {resumo}, {restaurante}. Até 1000.' },
  { nome: 'jeito_resposta_final', campo: 'responseMode', explicacao: '"exato" = envia a resposta final como está. "adaptar" = a IA adapta ao contexto da conversa.' },
  { nome: 'pausar_ia', campo: 'pauseAi', explicacao: 'true = depois de encaminhar, a conversa fica com a equipe e a IA para de responder esse cliente.' },
  { nome: 'numeros_aviso', campo: 'notifyPhones', explicacao: 'Números avisados no WhatsApp só nesta categoria, além dos números do funil. DDD + número (até 20).' },
  { nome: 'ativa', campo: 'isActive', explicacao: 'Liga ou desliga a regra (desligada, a IA não usa).' },
]

/** Campos de regra pelo nome do MCP, com a validacao da tela. */
const camposRegraMcp = {
  nome: camposDaRegra.name,
  etiqueta: camposDaRegra.tag,
  quando_usar: camposDaRegra.trigger,
  quando_nao_usar: camposDaRegra.notWhen,
  exemplos: camposDaRegra.examples,
  dados_a_coletar: camposDaRegra.collectFields,
  frase_pedido_dados: camposDaRegra.askMessage,
  caminho: camposDaRegra.flowMode,
  apresentacao: camposDaRegra.introMessage,
  fotos: camposDaRegra.introImages,
  resposta_final: camposDaRegra.responseMessage,
  jeito_resposta_final: camposDaRegra.responseMode,
  pausar_ia: camposDaRegra.pauseAi,
  numeros_aviso: telefonesSchema,
  ativa: camposDaRegra.isActive,
}
type CamposRegraMcp = { [K in keyof typeof camposRegraMcp]?: z.output<(typeof camposRegraMcp)[K]> }

const opcionais = Object.fromEntries(Object.entries(camposRegraMcp).map(([k, s]) => [k, s.optional()])) as {
  [K in keyof typeof camposRegraMcp]: z.ZodOptional<(typeof camposRegraMcp)[K]>
}

export const alterarRegraSchema = z.object({
  motivo: z.string().trim().min(3).max(300),
  simular: z.boolean().default(true),
  alteracao: z.discriminatedUnion('acao', [
    z.object({
      acao: z.literal('criar'),
      funil: z.enum(['eventos', 'atendimento']),
      ...opcionais,
      nome: camposRegraMcp.nome,
      etiqueta: camposRegraMcp.etiqueta,
      quando_usar: camposRegraMcp.quando_usar,
    }),
    z.object({ acao: z.literal('editar'), id: z.string().uuid(), versao: z.string().min(10).max(40), ...opcionais }),
    z.object({ acao: z.literal('apagar'), id: z.string().uuid(), versao: z.string().min(10).max(40) }),
  ]),
})
export type EntradaRegra = z.infer<typeof alterarRegraSchema>

/** Regra no formato do MCP (nomes em portugues), sem id e versao. */
export function fotoRegra(r: HandoffRule): Record<string, unknown> {
  const foto: Record<string, unknown> = { funil: r.funnel, chave: r.key, automatica: r.isSystem }
  for (const g of GUIA_REGRA) foto[g.nome] = r[g.campo]
  return foto
}

/** Dados do Prisma a partir dos campos do MCP (so os enviados; so colunas simples). */
function dadosDaRegra(c: CamposRegraMcp): Prisma.HandoffRuleUpdateManyMutationInput {
  const d: Record<string, unknown> = {}
  for (const g of GUIA_REGRA) {
    const v = (c as Record<string, unknown>)[g.nome]
    if (v !== undefined) d[g.campo] = v
  }
  return d as Prisma.HandoffRuleUpdateManyMutationInput
}

/** Regra automatica (falha da IA): o texto e do sistema. */
const EDITAVEIS_NA_AUTOMATICA = new Set(['ativa', 'etiqueta', 'numeros_aviso'])

function conferirCaminho(foto: Record<string, unknown>) {
  if (foto.caminho === 'apresentar' && !String(foto.apresentacao ?? '').trim()) {
    throw new ErroConfig('No caminho "apresentar" a apresentação é obrigatória (é o que vai antes das perguntas). Preencha "apresentacao" ou use o caminho "coletar".')
  }
}

export async function listarRegrasMcp(companyId: string) {
  const [regras, avisos] = await Promise.all([
    listarRegras(companyId),
    prisma.handoffNotify.findMany({
      where: { companyId },
      select: { funnel: true, enabled: true, phones: true, inbox: { select: { displayName: true, instanceName: true } } },
    }),
  ])
  return {
    regras: regras.map((r) => ({ id: r.id, versao: versaoDe(r.updatedAt), ...fotoRegra(r) })),
    avisosDoFunil: avisos.map((a) => ({
      funil: a.funnel,
      ligado: a.enabled,
      numeros: a.phones,
      enviadoPor: a.inbox ? a.inbox.displayName || a.inbox.instanceName : null,
    })),
    guia: GUIA_REGRA.map(({ nome, explicacao }) => ({ nome, explicacao })),
  }
}

async function regraNaVersao(companyId: string, id: string, versao: string): Promise<HandoffRule> {
  const regra = await prisma.handoffRule.findFirst({ where: { id, companyId } })
  if (!regra) throw new ErroConfig('Regra não encontrada neste restaurante. Use listar_regras.', 404)
  if (versaoDe(regra.updatedAt) !== versao) {
    throw new ErroConfig('Esta regra mudou depois da sua leitura. Leia de novo e refaça em cima da versão atual.', 409)
  }
  return regra
}

/** Chave unica no restaurante (a IA escolhe a regra por ela): nome + sufixo se repetir. */
async function chaveLivre(companyId: string, nome: string, preferida?: string): Promise<string> {
  const base = preferida || chaveDaRegra(nome)
  const usadas = new Set(
    (await prisma.handoffRule.findMany({ where: { companyId, key: { startsWith: base } }, select: { key: true } })).map((r) => r.key)
  )
  let key = base
  for (let i = 2; usadas.has(key); i++) key = `${base}_${i}`
  return key
}

export async function alterarRegra(companyId: string, e: EntradaRegra): Promise<ResultadoAlteracao> {
  const a = e.alteracao

  if (a.acao === 'criar') {
    // Mesmos padroes da tela (POST /api/solicitacoes/regras).
    const campos: CamposRegraMcp = {
      quando_nao_usar: '',
      exemplos: [],
      dados_a_coletar: [],
      frase_pedido_dados: '',
      caminho: 'coletar',
      apresentacao: '',
      fotos: [],
      resposta_final: '',
      jeito_resposta_final: 'adaptar',
      pausar_ia: true,
      numeros_aviso: [],
      ativa: true,
      ...Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined)),
    }
    const previa: Record<string, unknown> = { funil: a.funil, automatica: false }
    for (const g of GUIA_REGRA) previa[g.nome] = (campos as Record<string, unknown>)[g.nome]
    conferirCaminho(previa)
    if (e.simular) return { simulado: true, entidade: 'regra', acao: 'criar', id: null, antes: null, depois: previa }

    const key = await chaveLivre(companyId, a.nome)
    const ultima = await prisma.handoffRule.findFirst({
      where: { companyId, funnel: a.funil },
      select: { sortOrder: true },
      orderBy: { sortOrder: 'desc' },
    })
    const { regra, mudanca } = await prisma.$transaction(async (tx) => {
      const regra = await tx.handoffRule.create({
        data: {
          companyId,
          funnel: a.funil,
          key,
          sortOrder: (ultima?.sortOrder ?? 0) + 1,
          ...(dadosDaRegra(campos) as Record<string, unknown>),
        } as Prisma.HandoffRuleUncheckedCreateInput,
      })
      const mudanca = await tx.configChange.create({
        data: { companyId, entity: 'regra', entityId: regra.id, action: 'criar', after: json(fotoRegra(regra)), reason: e.motivo },
      })
      return { regra, mudanca }
    })
    limparCacheEquipe(companyId)
    return { simulado: false, entidade: 'regra', acao: 'criar', id: regra.id, antes: null, depois: fotoRegra(regra), alteracaoId: mudanca.id, versao: versaoDe(regra.updatedAt) }
  }

  const atual = await regraNaVersao(companyId, a.id, a.versao)
  const antes = fotoRegra(atual)

  if (a.acao === 'apagar') {
    if (atual.isSystem) {
      throw new ErroConfig('A regra automática (falha da IA) não pode ser apagada; desligue com ativa=false se não quiser usar.', 409)
    }
    if (e.simular) return { simulado: true, entidade: 'regra', acao: 'apagar', id: atual.id, antes, depois: null }
    const mudanca = await prisma.$transaction(async (tx) => {
      const n = await tx.handoffRule.deleteMany({ where: { id: atual.id, companyId, updatedAt: atual.updatedAt } })
      if (n.count === 0) throw new ErroConfig('A regra mudou enquanto a alteração era gravada. Leia de novo.', 409)
      return tx.configChange.create({
        data: { companyId, entity: 'regra', entityId: atual.id, action: 'apagar', before: json(antes), reason: e.motivo },
      })
    })
    limparCacheEquipe(companyId)
    return { simulado: false, entidade: 'regra', acao: 'apagar', id: atual.id, antes, depois: null, alteracaoId: mudanca.id }
  }

  const { acao: _acao, id: _id, versao: _versao, ...pedidos } = a
  const enviados = Object.fromEntries(Object.entries(pedidos).filter(([, v]) => v !== undefined)) as CamposRegraMcp
  if (atual.isSystem) {
    const fora = Object.keys(enviados).filter((k) => !EDITAVEIS_NA_AUTOMATICA.has(k))
    if (fora.length) {
      throw new ErroConfig(`Regra automática (falha da IA): o texto é do sistema. Dá para mudar só ativa, etiqueta e numeros_aviso (recusado: ${fora.join(', ')}).`)
    }
  }
  const depois = { ...antes, ...enviados }
  conferirCaminho(depois)
  if (iguais(antes, depois)) throw new ErroConfig('Os valores enviados são iguais aos atuais. Nada foi alterado.')
  if (e.simular) return { simulado: true, entidade: 'regra', acao: 'editar', id: atual.id, antes, depois }

  const { regra, mudanca } = await gravarRegra(companyId, atual, dadosDaRegra(enviados), 'editar', e.motivo)
  if (enviados.numeros_aviso !== undefined) limparCacheEquipe(companyId)
  return { simulado: false, entidade: 'regra', acao: 'editar', id: regra.id, antes, depois: fotoRegra(regra), alteracaoId: mudanca.id, versao: versaoDe(regra.updatedAt) }
}

async function gravarRegra(companyId: string, atual: HandoffRule, dados: Prisma.HandoffRuleUpdateManyMutationInput, acao: string, motivo: string) {
  return prisma.$transaction(async (tx) => {
    const n = await tx.handoffRule.updateMany({
      where: { id: atual.id, companyId, updatedAt: atual.updatedAt },
      data: dados,
    })
    if (n.count === 0) throw new ErroConfig('A regra mudou enquanto a alteração era gravada. Leia de novo.', 409)
    const regra = await tx.handoffRule.findFirstOrThrow({ where: { id: atual.id, companyId } })
    const mudanca = await tx.configChange.create({
      data: { companyId, entity: 'regra', entityId: atual.id, action: acao, before: json(fotoRegra(atual)), after: json(fotoRegra(regra)), reason: motivo },
    })
    return { regra, mudanca }
  })
}

// ─── Ferramentas ──────────────────────────────────────────────────────────

const MODO_EXPLICADO: Record<string, string> = {
  function_calls: 'ferramentas do CRM (integrações ligadas para o restaurante)',
  mcp: 'servidor MCP (ex.: Reserve Maya): as ferramentas de reserva vêm do servidor',
  none: 'sem ferramentas externas: só as nativas',
}

export async function listarFerramentas(companyId: string, agentId: string | null) {
  const empresa = await prisma.company.findFirst({ where: { id: companyId }, select: { settings: true } })
  const ligadas = enabledNativeNames(empresa?.settings)
  const agente = agentId
    ? await prisma.aiAgent.findFirst({ where: { id: agentId, companyId }, select: { id: true, name: true, toolMode: true } })
    : null
  if (agentId && !agente) throw new ErroConfig('Agente não encontrado neste restaurante. Use listar_agentes.', 404)

  const recebe = await listCompanyTools(companyId, { agentId: agente?.id ?? null })
  return {
    versao: [...ligadas].sort().join(','),
    nativas: NATIVE_TOOLS.map((t) => ({ nome: t.name, rotulo: t.label, oQueFaz: t.help, ligada: ligadas.includes(t.name) })),
    ...(agente
      ? { agente: { id: agente.id, nome: agente.name, modo: modoDe(agente.toolMode), modoExplicado: MODO_EXPLICADO[modoDe(agente.toolMode)] } }
      : {}),
    /** O que a IA desse WhatsApp recebe de fato (nativas ligadas + integrações do modo). */
    iaRecebe: recebe.map((t) => ({ nome: t.name, rotulo: t.label, origem: t.source, alteraDados: t.isWrite })),
  }
}

export const alterarFerramentasSchema = z.object({
  motivo: z.string().trim().min(3).max(300),
  simular: z.boolean().default(true),
  versao: z.string().max(500),
  ligar: z.array(z.string().refine((n) => NATIVE_TOOL_NAMES.includes(n), 'Ferramenta nativa desconhecida')).max(20).default([]),
  desligar: z.array(z.string().refine((n) => NATIVE_TOOL_NAMES.includes(n), 'Ferramenta nativa desconhecida')).max(20).default([]),
})
export type EntradaFerramentas = z.infer<typeof alterarFerramentasSchema>

export async function alterarFerramentas(companyId: string, e: EntradaFerramentas): Promise<ResultadoAlteracao> {
  const empresa = await prisma.company.findFirst({ where: { id: companyId }, select: { settings: true } })
  if (!empresa) throw new ErroConfig('Restaurante não encontrado.', 404)
  const antesLista = enabledNativeNames(empresa.settings)
  if ([...antesLista].sort().join(',') !== e.versao) {
    throw new ErroConfig('As ferramentas mudaram depois da sua leitura. Leia de novo (listar_ferramentas) e refaça.', 409)
  }
  const ambos = e.ligar.filter((n) => e.desligar.includes(n))
  if (ambos.length) throw new ErroConfig(`Ligar e desligar a mesma ferramenta não dá: ${ambos.join(', ')}.`)
  const depoisLista = NATIVE_TOOL_NAMES.filter((n) => (antesLista.includes(n) || e.ligar.includes(n)) && !e.desligar.includes(n))
  if (iguais([...antesLista].sort(), [...depoisLista].sort())) {
    throw new ErroConfig('As ferramentas já estão assim. Nada foi alterado.')
  }
  const antes = { nativas: antesLista }
  const depois = { nativas: depoisLista }
  if (e.simular) return { simulado: true, entidade: 'ferramentas', acao: 'editar', id: null, antes, depois }

  const mudanca = await gravarFerramentas(companyId, empresa.settings, depoisLista, antes, 'editar', e.motivo)
  return { simulado: false, entidade: 'ferramentas', acao: 'editar', id: null, antes, depois, alteracaoId: mudanca.id, versao: [...depoisLista].sort().join(',') }
}

async function gravarFerramentas(
  companyId: string,
  settingsLidos: Prisma.JsonValue,
  lista: string[],
  antes: { nativas: string[] },
  acao: string,
  motivo: string
) {
  return prisma.$transaction(async (tx) => {
    // Mescla no JSON de settings mantendo as outras chaves (igual a tela de Integracoes).
    const n = await tx.company.updateMany({
      where: { id: companyId, settings: settingsIguais(settingsLidos) },
      data: { settings: json({ ...comoRecord(settingsLidos), ai_native_tools: [...new Set(lista)] }) },
    })
    if (n.count === 0) throw new ErroConfig('As configurações do restaurante mudaram enquanto a alteração era gravada. Leia de novo.', 409)
    return tx.configChange.create({
      data: { companyId, entity: 'ferramentas', action: acao, before: json(antes), after: json({ nativas: lista }), reason: motivo },
    })
  })
}

// ─── Historico e desfazer ────────────────────────────────────────────────

export async function listarAlteracoes(companyId: string, limite = 30, entidade?: string) {
  const linhas = await prisma.configChange.findMany({
    where: { companyId, ...(entidade ? { entity: entidade } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limite, 1), 100),
  })
  return linhas.map((c) => ({
    id: c.id,
    quando: c.createdAt.toISOString(),
    entidade: c.entity,
    acao: c.action,
    registro: c.entityId,
    motivo: c.reason,
    antes: c.before,
    depois: c.after,
    desfeitaEm: c.undoneAt?.toISOString() ?? null,
  }))
}

export const desfazerSchema = z.object({
  id: z.string().uuid(),
  motivo: z.string().trim().min(3).max(300),
  simular: z.boolean().default(true),
})
export type EntradaDesfazer = z.infer<typeof desfazerSchema>

const MUDOU_DEPOIS =
  'O registro mudou depois desta alteração (pela tela ou por outra alteração). Desfazer agora apagaria essa mudança: confira o estado atual e altere direto.'

/**
 * Volta uma alteracao usando o `antes` dela. So se o registro continua como a
 * alteracao deixou (senao apagaria uma mudanca feita depois). A volta tambem
 * vira uma ConfigChange ('desfazer'), e a original fica marcada como desfeita.
 */
export async function desfazerAlteracao(companyId: string, e: EntradaDesfazer): Promise<ResultadoAlteracao> {
  const c = await prisma.configChange.findFirst({ where: { id: e.id, companyId } })
  if (!c) throw new ErroConfig('Alteração não encontrada neste restaurante. Use listar_alteracoes.', 404)
  if (c.undoneAt) throw new ErroConfig('Esta alteração já foi desfeita.', 409)
  if (c.action === 'desfazer') throw new ErroConfig('Esta já é uma volta. Para refazer, faça a alteração de novo.', 409)

  const antes = c.before ? comoRecord(c.before) : null
  const depois = c.after ? comoRecord(c.after) : null
  const marcar = async (tx: Prisma.TransactionClient, nova: { id: string }) => {
    await tx.configChange.updateMany({ where: { id: c.id, companyId, undoneAt: null }, data: { undoneAt: new Date(), undoneById: nova.id } })
  }

  if (c.entity === 'faq') {
    if (c.action === 'apagar') {
      // Recria a pergunta apagada (com id novo).
      if (!antes) throw new ErroConfig('Sem o conteúdo anterior para recriar.', 409)
      const foto = antes as unknown as FotoFaq
      if (e.simular) return { simulado: true, entidade: 'faq', acao: 'desfazer', id: null, antes: null, depois: { ...foto } }
      const { faq, nova } = await prisma.$transaction(async (tx) => {
        const faq = await tx.companyFaq.create({
          data: { companyId, question: foto.pergunta, answer: foto.resposta, category: foto.categoria, keywords: foto.palavrasChave, isActive: foto.ativa },
        })
        const nova = await tx.configChange.create({
          data: { companyId, entity: 'faq', entityId: faq.id, action: 'desfazer', after: json(foto), reason: e.motivo },
        })
        await marcar(tx, nova)
        return { faq, nova }
      })
      await indexFaq(companyId, faq)
      return { simulado: false, entidade: 'faq', acao: 'desfazer', id: faq.id, antes: null, depois: { ...foto }, alteracaoId: nova.id, versao: versaoDe(faq.updatedAt) }
    }

    const atual = c.entityId ? await prisma.companyFaq.findFirst({ where: { id: c.entityId, companyId } }) : null
    if (!atual) throw new ErroConfig('A pergunta já não existe (foi apagada depois). Nada a desfazer.', 409)
    if (!iguais(fotoFaq(atual), depois)) throw new ErroConfig(MUDOU_DEPOIS, 409)

    if (c.action === 'criar') {
      if (e.simular) return { simulado: true, entidade: 'faq', acao: 'desfazer', id: atual.id, antes: { ...fotoFaq(atual) }, depois: null }
      const nova = await prisma.$transaction(async (tx) => {
        const n = await tx.companyFaq.deleteMany({ where: { id: atual.id, companyId, updatedAt: atual.updatedAt } })
        if (n.count === 0) throw new ErroConfig(MUDOU_DEPOIS, 409)
        const nova = await tx.configChange.create({
          data: { companyId, entity: 'faq', entityId: atual.id, action: 'desfazer', before: json(fotoFaq(atual)), reason: e.motivo },
        })
        await marcar(tx, nova)
        return nova
      })
      await unindexFaq(companyId, atual.id)
      return { simulado: false, entidade: 'faq', acao: 'desfazer', id: atual.id, antes: { ...fotoFaq(atual) }, depois: null, alteracaoId: nova.id }
    }

    // editar: volta o texto anterior.
    const volta = antes as unknown as FotoFaq
    if (e.simular) return { simulado: true, entidade: 'faq', acao: 'desfazer', id: atual.id, antes: { ...fotoFaq(atual) }, depois: { ...volta } }
    const { faq, mudanca } = await prisma.$transaction(async (tx) => {
      const n = await tx.companyFaq.updateMany({
        where: { id: atual.id, companyId, updatedAt: atual.updatedAt },
        data: { question: volta.pergunta, answer: volta.resposta, category: volta.categoria, keywords: volta.palavrasChave, isActive: volta.ativa },
      })
      if (n.count === 0) throw new ErroConfig(MUDOU_DEPOIS, 409)
      const faq = await tx.companyFaq.findFirstOrThrow({ where: { id: atual.id, companyId } })
      const mudanca = await tx.configChange.create({
        data: { companyId, entity: 'faq', entityId: atual.id, action: 'desfazer', before: json(fotoFaq(atual)), after: json(volta), reason: e.motivo },
      })
      await marcar(tx, mudanca)
      return { faq, mudanca }
    })
    await indexFaq(companyId, faq)
    return { simulado: false, entidade: 'faq', acao: 'desfazer', id: faq.id, antes: { ...fotoFaq(atual) }, depois: { ...volta }, alteracaoId: mudanca.id, versao: versaoDe(faq.updatedAt) }
  }

  if (c.entity === 'regra') {
    if (c.action === 'apagar') {
      if (!antes) throw new ErroConfig('Sem o conteúdo anterior para recriar.', 409)
      const funil = String(antes.funil)
      if (funil !== 'eventos' && funil !== 'atendimento') throw new ErroConfig('Funil da regra apagada inválido.', 409)
      if (e.simular) return { simulado: true, entidade: 'regra', acao: 'desfazer', id: null, antes: null, depois: antes }
      const key = await chaveLivre(companyId, String(antes.nome ?? 'regra'), String(antes.chave ?? ''))
      const { regra, nova } = await prisma.$transaction(async (tx) => {
        const regra = await tx.handoffRule.create({
          data: { companyId, funnel: funil, key, ...(dadosDaRegra(antes as CamposRegraMcp) as Record<string, unknown>) } as Prisma.HandoffRuleUncheckedCreateInput,
        })
        const nova = await tx.configChange.create({
          data: { companyId, entity: 'regra', entityId: regra.id, action: 'desfazer', after: json(fotoRegra(regra)), reason: e.motivo },
        })
        await marcar(tx, nova)
        return { regra, nova }
      })
      limparCacheEquipe(companyId)
      return { simulado: false, entidade: 'regra', acao: 'desfazer', id: regra.id, antes: null, depois: fotoRegra(regra), alteracaoId: nova.id, versao: versaoDe(regra.updatedAt) }
    }

    const atual = c.entityId ? await prisma.handoffRule.findFirst({ where: { id: c.entityId, companyId } }) : null
    if (!atual) throw new ErroConfig('A regra já não existe (foi apagada depois). Nada a desfazer.', 409)
    if (!iguais(fotoRegra(atual), depois)) throw new ErroConfig(MUDOU_DEPOIS, 409)

    if (c.action === 'criar') {
      if (e.simular) return { simulado: true, entidade: 'regra', acao: 'desfazer', id: atual.id, antes: fotoRegra(atual), depois: null }
      const nova = await prisma.$transaction(async (tx) => {
        const n = await tx.handoffRule.deleteMany({ where: { id: atual.id, companyId, updatedAt: atual.updatedAt } })
        if (n.count === 0) throw new ErroConfig(MUDOU_DEPOIS, 409)
        const nova = await tx.configChange.create({
          data: { companyId, entity: 'regra', entityId: atual.id, action: 'desfazer', before: json(fotoRegra(atual)), reason: e.motivo },
        })
        await marcar(tx, nova)
        return nova
      })
      limparCacheEquipe(companyId)
      return { simulado: false, entidade: 'regra', acao: 'desfazer', id: atual.id, antes: fotoRegra(atual), depois: null, alteracaoId: nova.id }
    }

    if (!antes) throw new ErroConfig('Sem o conteúdo anterior para voltar.', 409)
    if (e.simular) return { simulado: true, entidade: 'regra', acao: 'desfazer', id: atual.id, antes: fotoRegra(atual), depois: antes }
    const { regra, mudanca } = await prisma.$transaction(async (tx) => {
      const n = await tx.handoffRule.updateMany({
        where: { id: atual.id, companyId, updatedAt: atual.updatedAt },
        data: dadosDaRegra(antes as CamposRegraMcp),
      })
      if (n.count === 0) throw new ErroConfig(MUDOU_DEPOIS, 409)
      const regra = await tx.handoffRule.findFirstOrThrow({ where: { id: atual.id, companyId } })
      const mudanca = await tx.configChange.create({
        data: { companyId, entity: 'regra', entityId: atual.id, action: 'desfazer', before: json(fotoRegra(atual)), after: json(fotoRegra(regra)), reason: e.motivo },
      })
      await marcar(tx, mudanca)
      return { regra, mudanca }
    })
    limparCacheEquipe(companyId)
    return { simulado: false, entidade: 'regra', acao: 'desfazer', id: regra.id, antes: fotoRegra(atual), depois: fotoRegra(regra), alteracaoId: mudanca.id, versao: versaoDe(regra.updatedAt) }
  }

  if (c.entity === 'ferramentas') {
    const empresa = await prisma.company.findFirst({ where: { id: companyId }, select: { settings: true } })
    if (!empresa) throw new ErroConfig('Restaurante não encontrado.', 404)
    const atualLista = enabledNativeNames(empresa.settings)
    const depoisLista = Array.isArray(depois?.nativas) ? (depois!.nativas as string[]) : []
    const antesLista = Array.isArray(antes?.nativas) ? (antes!.nativas as string[]) : []
    if (!iguais([...atualLista].sort(), [...depoisLista].sort())) throw new ErroConfig(MUDOU_DEPOIS, 409)
    const voltaLista = antesLista.filter((n) => NATIVE_TOOL_NAMES.includes(n))
    if (e.simular) return { simulado: true, entidade: 'ferramentas', acao: 'desfazer', id: null, antes: { nativas: atualLista }, depois: { nativas: voltaLista } }
    const mudanca = await prisma.$transaction(async (tx) => {
      const n = await tx.company.updateMany({
        where: { id: companyId, settings: settingsIguais(empresa.settings) },
        data: { settings: json({ ...comoRecord(empresa.settings), ai_native_tools: [...new Set(voltaLista)] }) },
      })
      if (n.count === 0) throw new ErroConfig(MUDOU_DEPOIS, 409)
      const mudanca = await tx.configChange.create({
        data: { companyId, entity: 'ferramentas', action: 'desfazer', before: json({ nativas: atualLista }), after: json({ nativas: voltaLista }), reason: e.motivo },
      })
      await marcar(tx, mudanca)
      return mudanca
    })
    return { simulado: false, entidade: 'ferramentas', acao: 'desfazer', id: null, antes: { nativas: atualLista }, depois: { nativas: voltaLista }, alteracaoId: mudanca.id }
  }

  throw new ErroConfig('Tipo de alteração desconhecido.', 409)
}

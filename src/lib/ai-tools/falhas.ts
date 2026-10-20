import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { explicarFalhaFerramenta, type FalhaFerramentaExplicada } from '@/lib/erros/ferramentas'
import { getNativeTool } from './native'

/**
 * Falhas recentes das ferramentas da IA (AiToolCall ok=false), agrupadas e
 * explicadas pra tela: painel "Situação", card da integração e super-admin.
 *
 * - Ignora o que e atendimento normal (faltou dado, evento lotado...).
 * - Agrupa por tipo de falha + sistema (integracao) ou ferramenta (nativa):
 *   "Reserve Maya nao respondeu (3x)" em vez de 3 linhas.
 * - Grupo resolvido some: chamada do mesmo sistema que deu certo DEPOIS da
 *   ultima falha (ou "Testar conexão" que passou depois) = ja voltou.
 */

export interface GrupoFalhas {
  chave: string
  explicacao: FalhaFerramentaExplicada
  integrationId: string | null
  /** Nome do sistema externo; null = ferramenta do proprio CRM. */
  sistema: string | null
  /** Nomes amigaveis das ferramentas que falharam. */
  ferramentas: string[]
  vezes: number
  ultimaEm: Date
  ultimaConversa: string | null
  /** WhatsApp (inbox) da conversa da ultima falha. */
  ultimaInbox: string | null
  /** So pra super-admin. */
  tecnico: { ferramenta: string; httpStatus: number | null; erro: string | null }
}

/** Falha de configuracao do WhatsApp: so outra chamada do MESMO WhatsApp prova que resolveu. */
const POR_WHATSAPP = new Set(['nao_configurada', 'id_errado'])

const LIMITE = 300

export async function falhasRecentesDeFerramentas(
  companyId: string,
  opcoes: { desde: Date; inboxId?: string | null; integrationId?: string | null }
): Promise<GrupoFalhas[]> {
  const where: Prisma.AiToolCallWhereInput = {
    companyId,
    ok: false,
    createdAt: { gte: opcoes.desde },
    ...(opcoes.integrationId ? { integrationId: opcoes.integrationId } : {}),
    ...(opcoes.inboxId ? { conversation: { companyId, inboxId: opcoes.inboxId } } : {}),
  }
  const chamadas = await prisma.aiToolCall.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: LIMITE,
    select: {
      toolName: true,
      integrationId: true,
      error: true,
      httpStatus: true,
      conversationId: true,
      createdAt: true,
      conversation: { select: { inboxId: true } },
    },
  })
  if (chamadas.length === 0) return []

  // Nomes amigaveis: sistema (Integration.name) e ferramenta (label).
  const idsIntegracao = [...new Set(chamadas.map((c) => c.integrationId).filter((id): id is string => !!id))]
  const nomesIntegracaoTool = [...new Set(chamadas.filter((c) => !getNativeTool(c.toolName)).map((c) => c.toolName))]
  const [integracoes, ferramentas] = await Promise.all([
    idsIntegracao.length
      ? prisma.integration.findMany({ where: { id: { in: idsIntegracao } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    nomesIntegracaoTool.length
      ? prisma.integrationTool.findMany({ where: { name: { in: nomesIntegracaoTool } }, select: { name: true, label: true } })
      : Promise.resolve([]),
  ])
  const nomeSistema = new Map(integracoes.map((i) => [i.id, i.name]))
  const labelTool = new Map(ferramentas.map((f) => [f.name, f.label]))
  const rotulo = (toolName: string) => getNativeTool(toolName)?.label ?? labelTool.get(toolName) ?? toolName

  // Ja vem da mais nova pra mais antiga: o primeiro de cada grupo e a ultima falha.
  const grupos = new Map<string, GrupoFalhas>()
  for (const c of chamadas) {
    const sistema = c.integrationId ? nomeSistema.get(c.integrationId) ?? null : null
    const ferramenta = rotulo(c.toolName)
    const explicacao = explicarFalhaFerramenta({ error: c.error, httpStatus: c.httpStatus, sistema, ferramenta })
    if (explicacao.nivel === 'normal') continue

    const alvo = c.integrationId ?? `crm:${c.toolName}`
    const chave = `${explicacao.codigo}:${alvo}`
    const grupo = grupos.get(chave)
    if (grupo) {
      grupo.vezes += 1
      if (!grupo.ferramentas.includes(ferramenta)) grupo.ferramentas.push(ferramenta)
      continue
    }
    grupos.set(chave, {
      chave,
      explicacao,
      integrationId: c.integrationId,
      sistema,
      ferramentas: [ferramenta],
      vezes: 1,
      ultimaEm: c.createdAt,
      ultimaConversa: c.conversationId,
      ultimaInbox: c.conversation?.inboxId ?? null,
      tecnico: { ferramenta: c.toolName, httpStatus: c.httpStatus, erro: c.error ? c.error.slice(0, 500) : null },
    })
  }

  const abertos = await Promise.all(
    [...grupos.values()].map(async (g) => ((await resolvido(companyId, g)) ? null : g))
  )
  return abertos
    .filter((g): g is GrupoFalhas => !!g)
    .sort((a, b) => peso(b) - peso(a) || b.ultimaEm.getTime() - a.ultimaEm.getTime())
}

function peso(g: GrupoFalhas): number {
  return g.explicacao.nivel === 'problema' ? 1 : 0
}

async function resolvido(companyId: string, g: GrupoFalhas): Promise<boolean> {
  const porWhatsApp = POR_WHATSAPP.has(g.explicacao.codigo) && g.ultimaInbox
  const depois = await prisma.aiToolCall.findFirst({
    where: {
      companyId,
      ok: true,
      createdAt: { gt: g.ultimaEm },
      ...(g.integrationId ? { integrationId: g.integrationId } : { toolName: g.tecnico.ferramenta }),
      ...(porWhatsApp ? { conversation: { companyId, inboxId: g.ultimaInbox as string } } : {}),
    },
    select: { id: true },
  })
  if (depois) return true

  if (!g.integrationId) return false
  const teste = await prisma.companyIntegration.findFirst({
    where: { companyId, integrationId: g.integrationId, lastTestOk: true, lastTestAt: { gt: g.ultimaEm } },
    select: { id: true },
  })
  return !!teste
}

/** "hoje às 20:13", "ontem às 09:02" ou "12/10 às 18:40" (horario de Brasilia). */
export function quandoFoi(d: Date): string {
  const tz = 'America/Sao_Paulo'
  const dia = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: tz })
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
  const hoje = new Date()
  const ontem = new Date(hoje.getTime() - 24 * 60 * 60 * 1000)
  if (dia(d) === dia(hoje)) return `hoje às ${hora}`
  if (dia(d) === dia(ontem)) return `ontem às ${hora}`
  return `${d.toLocaleDateString('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit' })} às ${hora}`
}

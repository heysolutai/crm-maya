import { prisma } from '@/lib/db'
import { falhasRecentesDeFerramentas, quandoFoi } from '@/lib/ai-tools/falhas'
import { enabledNativeNames, NATIVE_TOOLS } from '@/lib/ai-tools/native'
import { explicarFalhaFerramenta } from '@/lib/erros/ferramentas'
import { maskConfig, parseConfigFields } from '@/lib/ai-tools/secrets'
import { collectPaths } from '@/lib/ai-tools/template'
import type { ConfigField } from '@/lib/ai-tools/types'

/**
 * Tela "Integrações" do restaurante: monta o estado (ferramentas nativas,
 * integrações do catálogo e IDs do restaurante por conexão) e traduz o
 * resultado do teste para uma frase que qualquer pessoa entende.
 *
 * Nada de cabeçalho, URL ou modelo da integração sai daqui: só o que o
 * restaurante pode ver e mexer.
 */

export interface NativeToolState {
  name: string
  label: string
  help: string
  isWrite: boolean
  enabled: boolean
}

export interface IntegrationState {
  id: string
  slug: string
  name: string
  description: string | null
  icon: string | null
  configFields: ConfigField[]
  config: Record<string, string>
  enabled: boolean
  enabledTools: string[]
  tools: { name: string; label: string; isWrite: boolean }[]
  hasTest: boolean
  /** Alguma ferramenta usa o ID do restaurante da conexão (caixa de entrada). */
  needsRestaurantId: boolean
  lastTest: { at: string; ok: boolean; error: string | null } | null
  /** Falha da IA com esta integração nas últimas 24h que ainda não voltou. */
  problemaRecente: ProblemaRecente | null
  /** De onde vem a configuração (catálogo do super-admin). Só vai para o super-admin. */
  origem?: OrigemIntegracao
}

export interface OrigemIntegracao {
  /** Tela do catálogo onde se edita endereço, chave e ferramentas. */
  href: string
  /** Só o host do endereço (sem caminho), pra conferir de relance. */
  endereco: string
  /** Há cabeçalho de credencial cadastrado (o valor nunca sai daqui). */
  temChave: boolean
}

function hostDe(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url.slice(0, 60)
  }
}

export interface RestaurantIdState {
  inboxId: string
  name: string
  restaurantId: string | null
}

export interface IntegrationsState {
  canEdit: boolean
  native: NativeToolState[]
  integrations: IntegrationState[]
  restaurantIds: RestaurantIdState[]
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/** Segmento do restaurante (Company.settings.segment), se houver. */
export function companySegment(settings: unknown): string | null {
  const v = asRecord(settings).segment
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** Integração sem segmento vale pra todos; sem segmento no restaurante, mostra todas. */
export function segmentWhere(segment: string | null) {
  return segment ? { OR: [{ segment: null }, { segment: { equals: segment, mode: 'insensitive' as const } }] } : {}
}

function restaurantIdOf(channelConfig: unknown): string | null {
  const v = asRecord(channelConfig).restaurantId
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

const GENERICA = 'Não foi possível falar com o sistema agora. Se continuar, fale com o suporte.'

/**
 * Erro técnico do teste -> frase amigável. Nunca devolve o texto técnico.
 * `fields` traduz `campo "chave" da integração` para o rótulo do campo.
 */
export function friendlyTestMessage(
  ok: boolean,
  error: string | null | undefined,
  fields: ConfigField[] = [],
  sistema: string | null = null
): string {
  if (ok) return 'Conexão funcionando.'
  const erro = (error || '').toLowerCase()

  if (erro.includes('configuracao incompleta')) {
    const faltaRestaurante = erro.includes('id do restaurante')
    const campos = [...(error || '').matchAll(/campo "([^"]+)" da integra/gi)]
      .map((m) => fields.find((f) => f.key === m[1])?.label || null)
      .filter((l): l is string => !!l)

    const partes: string[] = []
    if (faltaRestaurante) {
      partes.push(
        'Falta o ID do restaurante. Preencha o campo "ID do restaurante deste WhatsApp" e salve.'
      )
    }
    if (campos.length) {
      partes.push(`Preencha ${campos.length === 1 ? 'o campo' : 'os campos'} ${campos.map((c) => `"${c}"`).join(', ')} e salve.`)
    }
    return partes.length ? partes.join(' ') : 'Falta preencher alguma informação desta integração. Se não souber qual, fale com o suporte.'
  }

  if (erro.includes('ferramenta de teste')) {
    return 'Esta integração ainda não está pronta para teste. Fale com o suporte.'
  }

  // Mesmo tradutor das falhas da IA na conversa, com frase de teste onde a
  // explicacao fala de cliente/atendimento.
  const e = explicarFalhaFerramenta({ error, sistema })
  switch (e.codigo) {
    case 'recusado':
      return 'O sistema respondeu, mas recusou o teste. Confira se o "ID do restaurante" deste WhatsApp está certo. Se continuar, fale com o suporte.'
    case 'fora_do_ar':
      return `${e.titulo} (fora do ar ou muito lento). Tente de novo em alguns minutos. Se continuar, fale com o suporte.`
    case 'acesso_recusado':
    case 'id_errado':
    case 'endereco_errado':
    case 'pedido_invalido':
    case 'limite':
      return `${e.motivo} ${e.oQueFazer ?? ''}`.trim()
    default:
      return GENERICA
  }
}

/**
 * Problema recente da integracao (falha da IA nas ultimas 24h que ainda nao
 * voltou a funcionar), pro card em "Agente de IA" > "Ferramentas".
 */
export interface ProblemaRecente {
  titulo: string
  motivo: string
  oQueFazer: string | null
  vezes: number
  /** "hoje às 20:13" */
  quando: string
  ferramentas: string[]
}

async function problemasRecentes(companyId: string): Promise<Map<string, ProblemaRecente>> {
  const grupos = await falhasRecentesDeFerramentas(companyId, { desde: new Date(Date.now() - 24 * 60 * 60 * 1000) })
  const porIntegracao = new Map<string, ProblemaRecente>()
  // Ja vem ordenado (problema primeiro, mais recente primeiro): fica o principal.
  for (const g of grupos) {
    if (!g.integrationId || porIntegracao.has(g.integrationId)) continue
    // Falta do ID: o proprio card ja avisa olhando o estado ATUAL do campo.
    if (g.explicacao.codigo === 'nao_configurada' && g.explicacao.titulo.startsWith('Falta o ID')) continue
    porIntegracao.set(g.integrationId, {
      titulo: g.explicacao.titulo,
      motivo: g.explicacao.motivo,
      oQueFazer: g.explicacao.oQueFazer,
      vezes: g.vezes,
      quando: quandoFoi(g.ultimaEm),
      ferramentas: g.ferramentas,
    })
  }
  return porIntegracao
}

/** Estado completo da tela (GET e resposta do PUT). */
export async function loadIntegrationsState(
  companyId: string,
  canEdit: boolean,
  superAdmin = false
): Promise<IntegrationsState> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { settings: true } })
  const segment = companySegment(company?.settings)
  const nativeOn = new Set(enabledNativeNames(company?.settings))

  const [integrations, inboxes, problemas] = await Promise.all([
    prisma.integration.findMany({
      // Catalogo (companyId null): a conexao MCP privada aparece no modo "Servidor MCP".
      where: { isActive: true, companyId: null, ...segmentWhere(segment) },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        icon: true,
        configFields: true,
        testToolName: true,
        baseUrl: true,
        headers: true,
        tools: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: { name: true, label: true, isWrite: true, path: true, bodyTemplate: true },
        },
        companyIntegrations: {
          where: { companyId },
          select: {
            enabled: true,
            config: true,
            enabledTools: true,
            lastTestAt: true,
            lastTestOk: true,
            lastError: true,
          },
          take: 1,
        },
      },
    }),
    prisma.inbox.findMany({
      where: { companyId, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, displayName: true, instanceName: true, channelConfig: true },
    }),
    // A tela nao pode quebrar por causa do aviso: sem ele, segue sem.
    problemasRecentes(companyId).catch((err) => {
      console.error('[integrations] falha ao ler problemas recentes:', err)
      return new Map<string, ProblemaRecente>()
    }),
  ])

  return {
    canEdit,
    native: NATIVE_TOOLS.map((t) => ({
      name: t.name,
      label: t.label,
      help: t.help,
      isWrite: t.isWrite,
      enabled: nativeOn.has(t.name),
    })),
    integrations: integrations.map((i) => {
      const fields = parseConfigFields(i.configFields)
      const ci = i.companyIntegrations[0]
      const activeNames = new Set(i.tools.map((t) => t.name))
      const paths = new Set<string>()
      for (const t of i.tools) {
        collectPaths(t.path, paths)
        collectPaths(t.bodyTemplate, paths)
      }
      return {
        id: i.id,
        slug: i.slug,
        name: i.name,
        description: i.description,
        icon: i.icon,
        configFields: fields,
        config: maskConfig(fields, ci?.config),
        enabled: ci?.enabled ?? false,
        enabledTools: (ci?.enabledTools ?? []).filter((n) => activeNames.has(n)),
        tools: i.tools.map((t) => ({ name: t.name, label: t.label, isWrite: t.isWrite })),
        hasTest: !!i.testToolName,
        needsRestaurantId: paths.has('inbox.restaurant_id'),
        lastTest: ci?.lastTestAt
          ? {
              at: ci.lastTestAt.toISOString(),
              ok: ci.lastTestOk === true,
              error: ci.lastTestOk === true ? null : friendlyTestMessage(false, ci.lastError, fields, i.name),
            }
          : null,
        problemaRecente: ci?.enabled ? problemas.get(i.id) ?? null : null,
        ...(superAdmin
          ? {
              origem: {
                href: `/super-admin/integrations/${i.id}`,
                endereco: hostDe(i.baseUrl),
                temChave: Object.keys(asRecord(i.headers)).length > 0,
              },
            }
          : {}),
      }
    }),
    restaurantIds: inboxes.map((ib) => ({
      inboxId: ib.id,
      name: ib.displayName || ib.instanceName,
      restaurantId: restaurantIdOf(ib.channelConfig),
    })),
  }
}

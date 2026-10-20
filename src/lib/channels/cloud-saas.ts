/**
 * Conexao self-service do WhatsApp Cloud pelo admin do restaurante, via
 * Contas SaaS da Covercut (white-label).
 *
 * Modelo "uma sub-conta por restaurante": external_id = companyId. O backend
 * cria/reaproveita a sub-conta e devolve o link de conexao (pop-up da Meta).
 * Quando o numero conecta, ele fica DENTRO da sub-conta daquele restaurante na
 * Covercut; o sync lista so `external_id = companyId` e cria as inboxes.
 *
 * Por isso aqui ninguem digita phone_number_id: o vinculo numero <-> empresa
 * vem da propria Covercut, e um admin nao consegue puxar numero de outro
 * restaurante (o risco que obrigou o cadastro manual a ser so super-admin).
 * O `client_ref` (link compartilhado) NAO e usado: a doc avisa que ele pode
 * ser editado na URL.
 */

import { prisma } from '@/lib/db'
import { covercutRequest } from './covercut'
import { cloudInstanceName, whatsappCloudAdapter } from './adapters/whatsapp-cloud'
import { ensureInboxAiAgent } from '@/lib/api/inbox-ai-agent'

/** Base publica do app (webhooks). Mesma regra de /api/agents. */
export function publicAppBaseUrl(req: { nextUrl: { protocol: string; host: string } }): string {
  const envBase = process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL
  const base = envBase || `${req.nextUrl.protocol}//${req.nextUrl.host}`
  return base.replace(/\/+$/, '')
}

function numberLimit(): number {
  const n = Number(process.env.COVERCUT_SAAS_NUMBER_LIMIT)
  return Number.isInteger(n) && n > 0 ? n : 1
}

export interface ConnectLink {
  url: string
  origin: string
  reusedExisting: boolean
}

interface SaasCreateResponse {
  direct_link?: string
  magic_link?: string
  sub_customer_id?: number
  reused_existing?: boolean
}

/**
 * Cria (ou reaproveita, idempotente por external_id) a sub-conta do
 * restaurante e devolve um link de conexao novo.
 */
export async function createCloudConnectLink(companyId: string): Promise<ConnectLink> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, tradeName: true },
  })
  if (!company) throw new Error('Empresa nao encontrada')

  const res = await covercutRequest<SaasCreateResponse & Record<string, unknown>>('POST', '/saas/create', {
    body: {
      company_name: (company.tradeName || company.name).slice(0, 100),
      external_id: companyId,
      number_limit: numberLimit(),
      title: 'Conectar WhatsApp',
      autostart: true,
      layout: 'popup',
    },
  })

  const url = res.direct_link || res.magic_link
  if (!url || !url.startsWith('https://')) {
    throw new Error('WhatsApp Cloud nao devolveu o link de conexao')
  }
  return { url, origin: new URL(url).origin, reusedExisting: Boolean(res.reused_existing) }
}

interface SaasNumber {
  phone_number_id?: string
  display_phone_number?: string
  status?: string
}

interface SaasClient {
  id?: number
  external_id?: string | null
  numbers?: SaasNumber[]
}

export interface CloudSyncResult {
  created: { inboxId: string; phone: string }[]
  alreadyLinked: number
  /** Numeros da sub-conta que ja estao em inbox de OUTRA empresa (nao deveria acontecer) */
  conflicts: string[]
  failed: { phone: string; error: string }[]
}

/**
 * Cria a inbox de um numero ja conectado. O placeholder nasce com o
 * instanceName final sob advisory lock: o pop-up (sync pelo navegador) e o
 * webhook saas_customer_connected chegam quase juntos, e sem isso cada um
 * criaria uma inbox pro mesmo numero.
 */
async function createCloudInbox(params: {
  companyId: string
  phoneNumberId: string
  displayPhone: string
  webhookBaseUrl: string
  subCustomerId?: number
}): Promise<{ inboxId: string } | 'exists' | 'conflict'> {
  const instanceName = cloudInstanceName(params.phoneNumberId)
  const displayName = `WhatsApp ${params.displayPhone || params.phoneNumberId}`.slice(0, 255)

  const claimed = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${instanceName}))`
    const existing = await tx.inbox.findFirst({
      where: { instanceName },
      select: { id: true, companyId: true },
    })
    if (existing) return existing.companyId === params.companyId ? ('exists' as const) : ('conflict' as const)
    return tx.inbox.create({
      data: {
        companyId: params.companyId,
        instanceName,
        displayName,
        channelType: 'whatsapp_cloud',
        status: 'connecting',
        isActive: true,
      },
      select: { id: true },
    })
  })
  if (claimed === 'exists' || claimed === 'conflict') return claimed

  try {
    const result = await whatsappCloudAdapter.provision({
      companyId: params.companyId,
      displayName,
      webhookUrl: `${params.webhookBaseUrl}/api/webhooks/whatsapp-cloud?agentId=${claimed.id}`,
      extra: { phoneNumberId: params.phoneNumberId },
    })
    await prisma.inbox.update({
      where: { id: claimed.id },
      data: {
        apiUrl: result.apiUrl,
        instanceApiKey: result.instanceApiKey,
        channelConfig: {
          ...result.channelConfig,
          connectedVia: 'saas',
          ...(params.subCustomerId ? { subCustomerId: params.subCustomerId } : {}),
        },
        metadata: result.metadata as Record<string, string | null>,
        status: result.status ?? 'disconnected',
        phoneNumber: result.phoneNumber ?? null,
        ...(result.status === 'connected' ? { lastConnectedAt: new Date() } : {}),
      },
    })
    await ensureInboxAiAgent(claimed.id, params.companyId, displayName).catch((e) =>
      console.error('[cloud-saas] ensureInboxAiAgent falhou', e),
    )
    return { inboxId: claimed.id }
  } catch (error) {
    await prisma.inbox.delete({ where: { id: claimed.id } }).catch(() => {})
    throw error
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface PendingNumber {
  companyId: string
  phoneNumberId: string
  phone: string
  subCustomerId?: number
}

/** Numeros ativos das sub-contas, so das que tem external_id = companyId nosso. */
function activeNumbers(clients: SaasClient[]): PendingNumber[] {
  const out: PendingNumber[] = []
  for (const client of clients) {
    const companyId = client.external_id || ''
    if (!UUID_RE.test(companyId)) continue // sub-conta criada fora do sistema
    for (const number of client.numbers ?? []) {
      const phoneNumberId = (number.phone_number_id || '').replace(/\D/g, '')
      if (!phoneNumberId) continue
      if (number.status && number.status !== 'active') continue
      out.push({
        companyId,
        phoneNumberId,
        phone: number.display_phone_number || phoneNumberId,
        subCustomerId: client.id,
      })
    }
  }
  return out
}

/**
 * Cria as inboxes que faltam. Uma consulta pra saber o que ja existe: o cron
 * roda a cada 2 min e quase sempre nao tem nada novo.
 */
async function createMissing(pending: PendingNumber[], webhookBaseUrl: string): Promise<CloudSyncResult> {
  const result: CloudSyncResult = { created: [], alreadyLinked: 0, conflicts: [], failed: [] }
  if (pending.length === 0) return result

  const existing = await prisma.inbox.findMany({
    where: { instanceName: { in: pending.map((p) => cloudInstanceName(p.phoneNumberId)) } },
    select: { instanceName: true, companyId: true },
  })
  const owner = new Map(existing.map((i) => [i.instanceName, i.companyId]))

  const companies = await prisma.company.findMany({
    where: { id: { in: Array.from(new Set(pending.map((p) => p.companyId))) } },
    select: { id: true },
  })
  const validCompanies = new Set(companies.map((c) => c.id))

  for (const p of pending) {
    if (!validCompanies.has(p.companyId)) continue
    const linkedTo = owner.get(cloudInstanceName(p.phoneNumberId))
    if (linkedTo === p.companyId) {
      result.alreadyLinked++
      continue
    }
    if (linkedTo) {
      console.error('[cloud-saas] numero da sub-conta ja vinculado a outra empresa', p.phoneNumberId, p.companyId)
      result.conflicts.push(p.phone)
      continue
    }

    try {
      const created = await createCloudInbox({
        companyId: p.companyId,
        phoneNumberId: p.phoneNumberId,
        displayPhone: p.phone,
        webhookBaseUrl,
        subCustomerId: p.subCustomerId,
      })
      if (created === 'exists') result.alreadyLinked++
      else if (created === 'conflict') result.conflicts.push(p.phone)
      else result.created.push({ inboxId: created.inboxId, phone: p.phone })
    } catch (error) {
      console.error('[cloud-saas] falha ao criar inbox do numero', p.phoneNumberId, error)
      result.failed.push({ phone: p.phone, error: error instanceof Error ? error.message : 'erro desconhecido' })
    }
  }
  return result
}

/** Puxa os numeros da sub-conta de UM restaurante e cria as inboxes que faltam. */
export async function syncCloudNumbers(companyId: string, webhookBaseUrl: string): Promise<CloudSyncResult> {
  const res = await covercutRequest<{ clients?: SaasClient[] } & Record<string, unknown>>('GET', '/saas/list', {
    query: { external_id: companyId },
  })
  // O filtro e da Covercut; conferimos de novo pra nunca puxar numero de
  // sub-conta de outro restaurante.
  const clients = (res.clients ?? []).filter((c) => c.external_id === companyId)
  return createMissing(activeNumbers(clients), webhookBaseUrl)
}

/**
 * Varredura de TODAS as sub-contas (cron). Substitui a necessidade do
 * "Webhook de Notificacao" da Covercut, que so se configura pelo painel: o
 * restaurante conecta pelo link e a caixa aparece em ate 2 min, sem secret.
 */
export async function syncAllCloudNumbers(webhookBaseUrl: string): Promise<CloudSyncResult> {
  const res = await covercutRequest<{ clients?: SaasClient[] } & Record<string, unknown>>('GET', '/saas/list')
  return createMissing(activeNumbers(res.clients ?? []), webhookBaseUrl)
}

/** Base publica fora de request (cron): so pelo ambiente. */
export function envAppBaseUrl(): string | null {
  const base = process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL
  return base ? base.replace(/\/+$/, '') : null
}

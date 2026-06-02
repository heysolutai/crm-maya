import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { canonicalPhone, phoneVariants } from '@/lib/api/utils'

/**
 * Materializa a audiencia da campanha em campaign_recipients.
 *
 * Le `audience_config` da campanha e cria uma row em campaign_recipients pra
 * cada destinatario unico. Faz match com clients existentes por telefone, mas
 * NAO exige client — telefones de CSV/lista manual podem nao ter cadastro
 * (sao criados como recipients sem clientId).
 *
 * Idempotente parcial: por causa do unique (campaign_id, phone), reprocessar
 * a mesma audiencia nao cria duplicatas. Usa `skipDuplicates` no createMany.
 */

interface AudienceManual {
  source: 'manual'
  phones: string[]
  // Map opcional phone -> name, vindo do CSV upload (2a coluna).
  // Usado pra preencher recipient.name quando nao bate com Client.
  names?: Record<string, string>
}
interface AudienceTags {
  source: 'tags'
  tags: string[]
  matchMode?: 'any' | 'all'
}
interface AudienceIndividual {
  source: 'individual'
  clientIds: string[]
}
type AudienceConfig = AudienceManual | AudienceTags | AudienceIndividual

interface ResolvedRecipient {
  phone: string
  name: string | null
  clientId: string | null
}

async function resolveManual(
  companyId: string,
  raw: string[],
  namesMap?: Record<string, string>
): Promise<ResolvedRecipient[]> {
  const canonicalized = raw
    .map((p) => canonicalPhone(p))
    .filter((p) => p.length >= 10 && p.length <= 15)

  if (canonicalized.length === 0) return []

  // Tenta achar clients existentes por telefone (com variantes — celular brasileiro
  // com/sem 9 na frente bate em ambos)
  const allVariants = Array.from(new Set(canonicalized.flatMap((p) => phoneVariants(p))))
  const clients = await prisma.client.findMany({
    where: { companyId, phone: { in: allVariants } },
    select: { id: true, phone: true, firstName: true, lastName: true },
  })

  // Indexa por TODAS as variantes do telefone do cliente
  const byPhone = new Map<string, { id: string; name: string }>()
  for (const c of clients) {
    if (!c.phone) continue
    for (const v of phoneVariants(c.phone)) {
      byPhone.set(v, {
        id: c.id,
        name: `${c.firstName}${c.lastName ? ' ' + c.lastName : ''}`.trim(),
      })
    }
  }

  // Dedup por canonical. Prioridade do nome: client cadastrado > namesMap do CSV
  const seen = new Set<string>()
  const out: ResolvedRecipient[] = []
  for (const phone of canonicalized) {
    if (seen.has(phone)) continue
    seen.add(phone)
    const match = byPhone.get(phone)
    out.push({
      phone,
      name: match?.name || namesMap?.[phone] || null,
      clientId: match?.id || null,
    })
  }
  return out
}

async function resolveByTags(
  companyId: string,
  tags: string[],
  matchMode: 'any' | 'all'
): Promise<ResolvedRecipient[]> {
  const where: any = {
    companyId,
    optedOut: false, // pula opt-out ja na materializacao (worker tambem checa)
    phone: { not: null },
  }
  if (matchMode === 'all') {
    where.tags = { hasEvery: tags }
  } else {
    where.tags = { hasSome: tags }
  }
  const clients = await prisma.client.findMany({
    where,
    select: { id: true, phone: true, firstName: true, lastName: true },
  })
  return clients
    .filter((c): c is typeof c & { phone: string } => !!c.phone)
    .map((c) => ({
      phone: canonicalPhone(c.phone),
      name: `${c.firstName}${c.lastName ? ' ' + c.lastName : ''}`.trim() || null,
      clientId: c.id,
    }))
    .filter((r) => r.phone.length >= 10)
}

async function resolveIndividual(
  companyId: string,
  clientIds: string[]
): Promise<ResolvedRecipient[]> {
  const clients = await prisma.client.findMany({
    where: { id: { in: clientIds }, companyId, phone: { not: null } },
    select: { id: true, phone: true, firstName: true, lastName: true },
  })
  return clients
    .filter((c): c is typeof c & { phone: string } => !!c.phone)
    .map((c) => ({
      phone: canonicalPhone(c.phone),
      name: `${c.firstName}${c.lastName ? ' ' + c.lastName : ''}`.trim() || null,
      clientId: c.id,
    }))
    .filter((r) => r.phone.length >= 10)
}

async function resolveAudience(
  companyId: string,
  audience: AudienceConfig
): Promise<ResolvedRecipient[]> {
  if (audience.source === 'manual') {
    return resolveManual(companyId, audience.phones, audience.names)
  }
  if (audience.source === 'tags') {
    return resolveByTags(companyId, audience.tags, audience.matchMode || 'any')
  }
  return resolveIndividual(companyId, audience.clientIds)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
  }

  try {
    const { id } = await params
    const campaign = await prisma.campaign.findFirst({
      where: { id, companyId: auth.companyId },
    })
    if (!campaign) {
      return NextResponse.json({ error: 'Campanha nao encontrada' }, { status: 404 })
    }
    if (!['draft', 'scheduled'].includes(campaign.status)) {
      return NextResponse.json(
        { error: `Nao da pra alterar destinatarios com status "${campaign.status}"` },
        { status: 400 }
      )
    }

    const audience = campaign.audienceConfig as unknown as AudienceConfig
    if (!audience || !audience.source) {
      return NextResponse.json({ error: 'Audiencia nao configurada' }, { status: 400 })
    }

    const resolved = await resolveAudience(auth.companyId, audience)
    if (resolved.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum destinatario valido encontrado pra essa audiencia' },
        { status: 400 }
      )
    }

    // Cria recipients em batch. skipDuplicates evita duplicar quando o usuario
    // re-chama esse endpoint (ex: depois de editar a audiencia).
    const created = await prisma.campaignRecipient.createMany({
      data: resolved.map((r) => ({
        campaignId: id,
        clientId: r.clientId,
        phone: r.phone,
        name: r.name,
        status: 'pending' as const,
      })),
      skipDuplicates: true,
    })

    // Atualiza contador
    const total = await prisma.campaignRecipient.count({ where: { campaignId: id } })
    await prisma.campaign.update({
      where: { id },
      data: { recipientsTotal: total },
    })

    return NextResponse.json({
      success: true,
      resolved: resolved.length,
      created: created.count,
      total,
    })
  } catch (error) {
    console.error('Erro ao popular destinatarios:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
  }

  try {
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    // Confirma ownership via campaign
    const campaign = await prisma.campaign.findFirst({
      where: { id, companyId: auth.companyId },
      select: { id: true },
    })
    if (!campaign) {
      return NextResponse.json({ error: 'Campanha nao encontrada' }, { status: 404 })
    }

    const where: any = { campaignId: id }
    if (status) where.status = status

    const [data, total] = await Promise.all([
      prisma.campaignRecipient.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          phone: true,
          name: true,
          status: true,
          sentAt: true,
          errorMessage: true,
          clientId: true,
          providerMessageId: true,
        },
      }),
      prisma.campaignRecipient.count({ where }),
    ])

    return NextResponse.json({
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('Erro ao buscar destinatarios:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

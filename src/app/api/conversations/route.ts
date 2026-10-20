import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { logAction } from '@/lib/services/audit'
import { phoneVariants, canonicalPhone } from '@/lib/api/utils'
import { publishEvent } from '@/lib/realtime'
import { z } from 'zod'
import { handleApiError } from '@/lib/api/errors'
import type { Prisma } from '@prisma/client'

const createConversationSchema = z.object({
  companyId: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
  phone: z.string().min(1),
  name: z.string().min(1),
  interest: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  channel: z.string().optional(),
})

const conversationStatusEnum = z.enum(['active', 'pending', 'closed'])

const updateConversationSchema = z.object({
  id: z.string().uuid(),
  status: conversationStatusEnum.optional(),
  transferredTo: z.string().uuid().optional().nullable(),
  summary: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  stage: z.string().optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  aiHandled: z.boolean().optional(),
})

/** Data aceita na query: ISO completo ou YYYY-MM-DD. */
const queryDate = z
  .string()
  .max(40)
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Data invalida' })

// Query string vazia ("?status=") vale como ausente. O .optional() de fora e
// necessario no zod v4: sem ele o preprocess rejeita a chave ausente.
const optionalParam = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), schema.optional()).optional()

const listQuerySchema = z.object({
  status: optionalParam(conversationStatusEnum),
  aiHandled: optionalParam(z.enum(['true', 'false'])),
  /** true = so conversas cujo cliente esta com a IA pausada AGORA. */
  aiPaused: optionalParam(z.enum(['true', 'false'])),
  startDate: optionalParam(queryDate),
  endDate: optionalParam(queryDate),
  assignedTo: optionalParam(z.string().uuid()),
  departmentId: optionalParam(z.string().uuid()),
  inboxId: optionalParam(z.string().uuid()),
  /** Nome (first/last/full) ou telefone (so digitos). */
  search: optionalParam(z.string().trim().max(100)),
  /** Repetivel (?tag=a&tag=b): conversa com QUALQUER uma delas. */
  tag: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  limit: z.coerce.number().int().min(1).max(1000).catch(100),
  offset: z.coerce.number().int().min(0).catch(0),
})

/** Busca server-side: nome (cada palavra) OU telefone pelos digitos. */
function buildSearchFilter(term: string): Prisma.ClientWhereInput | null {
  const texto = term.trim()
  if (!texto) return null

  const palavras = texto.split(/\s+/).filter(Boolean).slice(0, 5)
  const porNome: Prisma.ClientWhereInput = {
    AND: palavras.map((p) => ({
      OR: [
        { firstName: { contains: p, mode: 'insensitive' as const } },
        { lastName: { contains: p, mode: 'insensitive' as const } },
        { fullName: { contains: p, mode: 'insensitive' as const } },
      ],
    })),
  }

  const or: Prisma.ClientWhereInput[] = [porNome]
  // Telefone e gravado so com digitos: "(11) 99999-1234" vira "11999991234".
  // Abaixo de 4 digitos casaria metade da base.
  const digitos = texto.replace(/\D/g, '')
  if (digitos.length >= 4) or.push({ phone: { contains: digitos } })

  return { OR: or }
}

export async function GET(req: NextRequest) {
  try {
    const { companyId, agentId, isSuperAdmin } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })

    const sp = req.nextUrl.searchParams
    const parsed = listQuerySchema.safeParse({
      status: sp.get('status'),
      aiHandled: sp.get('aiHandled'),
      aiPaused: sp.get('aiPaused'),
      startDate: sp.get('startDate'),
      endDate: sp.get('endDate'),
      assignedTo: sp.get('assignedTo'),
      departmentId: sp.get('departmentId'),
      inboxId: sp.get('inboxId') || sp.get('whatsappInstanceId'),
      search: sp.get('search'),
      tag: sp.getAll('tag').filter((t) => t.trim() !== ''),
      limit: sp.get('limit') ?? undefined,
      offset: sp.get('offset') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Parametros invalidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const q = parsed.data

    const where: Prisma.ConversationWhereInput = { companyId }
    // Filtros de cliente (busca, IA pausada) entram em AND: cada um e um
    // filtro de relacao proprio e nao podem sobrescrever um ao outro.
    const and: Prisma.ConversationWhereInput[] = []

    if (q.status) where.status = q.status
    if (q.aiHandled) where.aiHandled = q.aiHandled === 'true'
    if (q.startDate || q.endDate) {
      where.startedAt = {
        ...(q.startDate ? { gte: new Date(q.startDate) } : {}),
        ...(q.endDate ? { lte: new Date(q.endDate) } : {}),
      }
    }
    if (q.assignedTo) where.transferredTo = q.assignedTo
    if (q.departmentId) where.departmentId = q.departmentId
    if (q.inboxId) where.inboxId = q.inboxId
    if (q.tag && q.tag.length > 0) where.tags = { hasSome: q.tag }

    if (q.search) {
      const filtro = buildSearchFilter(q.search)
      if (filtro) and.push({ client: filtro })
    }

    // Mesma regra do isAiPausedNow: pausada e com prazo no futuro (ou sem prazo).
    if (q.aiPaused === 'true') {
      and.push({
        client: {
          aiPaused: true,
          OR: [{ aiPausedUntil: null }, { aiPausedUntil: { gt: new Date() } }],
        },
      })
    }

    if (and.length > 0) where.AND = and

    // Visibilidade por membership de inbox (regra B: estrita):
    //   - super_admin / company_admin / manager veem TUDO do restaurante
    //   - demais usuarios so veem conversas das inboxes que sao MEMBROS
    //   - 0 inboxes selecionadas = nao ve NADA (mesmo sendo do time/department)
    //   - conversas legadas SEM inbox tambem ficam invisiveis (so admin/manager veem)
    //
    // O super admin entra pelo flag da sessao, NAO pelo user_roles. O papel
    // dele e global (user_roles.company_id nulo), entao a busca abaixo por
    // (userId, companyId) nao acha nada durante uma personificacao: caia como
    // papel vazio, ia pro filtro de membership, nao tinha nenhuma, e a lista
    // vinha VAZIA. Quem administra o sistema inteiro via zero conversa.
    if (agentId && !isSuperAdmin) {
      const roleRow = await prisma.userRole.findFirst({
        where: { userId: agentId, companyId },
        select: { role: true },
      })
      const role = roleRow?.role || ''
      // 'super_admin' segue na lista por seguranca: cobre o caso de a flag da
      // sessao nao ter vindo mas existir a linha em user_roles.
      const isPrivileged = ['super_admin', 'company_admin', 'manager'].includes(role)

      if (!isPrivileged) {
        const memberships = await prisma.inboxMember.findMany({
          where: {
            userId: agentId,
            // Amarra ao tenant: membership remanescente de outro restaurante nao
            // deve entrar no calculo do escopo.
            inbox: { companyId },
          },
          select: { inboxId: true },
        })
        const memberInboxIds = memberships.map((m) => m.inboxId)

        if (memberInboxIds.length === 0) {
          // Sem inbox → vazio. Usamos um UUID impossivel pra garantir 0 resultados
          // sem precisar branchar o caller (mantem o shape do where).
          where.inboxId = '00000000-0000-0000-0000-000000000000'
        } else if (q.inboxId) {
          // Filtro de canal escolhido na tela: so vale se for uma inbox dele.
          where.inboxId = memberInboxIds.includes(q.inboxId)
            ? q.inboxId
            : '00000000-0000-0000-0000-000000000000'
        } else {
          where.inboxId = { in: memberInboxIds }
        }
      }
    }

    const conversations = await prisma.conversation.findMany({
      where,
      // include traz todos os escalares da conversa — inclusive executionUrl,
      // o link da execucao no n8n que o cabecalho abre.
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            whatsappLid: true,
            email: true,
            avatarUrl: true,
            aiPaused: true,
            aiPausedUntil: true,
            aiPausedAt: true,
            aiPausedBy: true,
          },
        },
        transferAgent: { select: { fullName: true } },
        department: { select: { id: true, name: true, color: true } },
        inbox: {
          select: { id: true, displayName: true, instanceName: true, channelType: true, phoneNumber: true },
        },
        messages: {
          select: { messageText: true, messageType: true, senderType: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { startedAt: 'desc' }],
      take: q.limit,
      skip: q.offset,
    })

    return NextResponse.json(conversations)
  } catch (error) {
    return handleApiError(error, 'Erro ao buscar conversas')
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId, agentId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
    const body = await req.json()

    const validation = createConversationSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const data = validation.data

    const rawPhone = (data.phone || '').replace(/[^0-9]/g, '')
    if (rawPhone.length < 10) {
      return NextResponse.json({ error: 'Número de telefone inválido' }, { status: 400 })
    }

    const variants = phoneVariants(rawPhone)
    const canonical = canonicalPhone(rawPhone)

    const name = data.name.trim()
    const interest = data.interest?.trim() || null
    const source = data.source?.trim() || null

    // Check if client exists: matching em todas as variações (com/sem 9)
    let client = await prisma.client.findFirst({
      where: {
        companyId,
        OR: [
          { phone: { in: variants } },
          { whatsappLid: { in: variants } },
        ],
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })

    // Create client if not found (usa forma canônica)
    if (!client) {
      client = await prisma.client.create({
        data: {
          companyId,
          phone: canonical,
          firstName: name,
          source: source || 'manual',
        },
        select: { id: true },
      })
    } else {
      await prisma.client.update({
        where: { id: client.id },
        data: {
          firstName: name,
          ...(source ? { source } : {}),
        },
      })
    }

    if (interest) {
      await prisma.clientNote.create({
        data: {
          clientId: client.id,
          companyId,
          createdBy: agentId || null,
          note: `Interesse: ${interest}`,
        },
      })
    }

    // Check for existing open conversation (qualquer status != closed)
    const existingConversation = await prisma.conversation.findFirst({
      where: {
        clientId: client.id,
        companyId,
        status: { not: 'closed' },
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    })

    if (existingConversation) {
      return NextResponse.json({ id: existingConversation.id, existing: true })
    }

    // Create new conversation: tratamos P2002 caso o partial unique index
    // (idx_conversations_one_open_per_client) detecte conflito por race condition
    let conversation: { id: string }
    try {
      conversation = await prisma.conversation.create({
        data: {
          clientId: client.id,
          companyId,
          status: 'active',
          channel: (data.channel || 'whatsapp') as any,
          startedAt: new Date(),
        },
        select: { id: true },
      })
    } catch (createErr: any) {
      if (createErr?.code === 'P2002') {
        const racer = await prisma.conversation.findFirst({
          where: {
            clientId: client.id,
            companyId,
            channel: (data.channel || 'whatsapp') as any,
            status: { not: 'closed' },
          },
          orderBy: { updatedAt: 'desc' },
          select: { id: true },
        })
        if (!racer) throw createErr
        return NextResponse.json({ id: racer.id, existing: true })
      }
      throw createErr
    }

    await logAction({
      companyId,
      userId: agentId,
      action: 'CREATE',
      entity: 'conversation',
      entityId: conversation.id,
    })

    await publishEvent(companyId, {
      type: 'conversation:update',
      conversationId: conversation.id,
    })

    return NextResponse.json({ id: conversation.id, existing: false }, { status: 201 })
  } catch (error) {
    return handleApiError(error, 'Erro ao criar conversa')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { companyId, agentId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
    const body = await req.json()

    const validation = updateConversationSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { id, ...updates } = validation.data

    const existing = await prisma.conversation.findFirst({ where: { id, companyId } })
    if (!existing) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    // IDOR: atendente e departamento de destino vem do body — precisam ser
    // deste restaurante, senao a conversa seria entregue a outra empresa.
    if (updates.transferredTo) {
      const alvo = await prisma.user.findFirst({
        where: {
          id: updates.transferredTo,
          isActive: true,
          OR: [{ companyId }, { userRoles: { some: { companyId } } }],
        },
        select: { id: true },
      })
      if (!alvo) return NextResponse.json({ error: 'Atendente invalido' }, { status: 400 })
    }
    if (updates.departmentId) {
      const dept = await prisma.department.findFirst({
        where: { id: updates.departmentId, companyId },
        select: { id: true },
      })
      if (!dept) return NextResponse.json({ error: 'Departamento invalido' }, { status: 400 })
    }

    // endedAt e a data REAL de fechamento: o dashboard conta "finalizadas no
    // periodo" por ele (updatedAt sobe em qualquer edicao). Reabrir limpa.
    const statusChanged = updates.status !== undefined && updates.status !== existing.status
    const endedAtPatch = !statusChanged
      ? {}
      : updates.status === 'closed'
        ? { endedAt: new Date() }
        : { endedAt: null }

    const conversation = await prisma.conversation.update({
      where: { id },
      data: { ...updates, ...endedAtPatch },
    })

    await logAction({
      companyId,
      userId: agentId,
      action: 'UPDATE',
      entity: 'conversation',
      entityId: conversation.id,
    })

    await publishEvent(companyId, {
      type: 'conversation:update',
      conversationId: conversation.id,
    })

    // Transferencia direta a um agente (muda transferredTo): notifica o alvo.
    // Transferencia pra fila/departamento passa pelo /api/messaging/transfer.
    if (updates.transferredTo && updates.transferredTo !== existing.transferredTo) {
      const client = conversation.clientId
        ? await prisma.client.findUnique({
            where: { id: conversation.clientId },
            select: { firstName: true, lastName: true },
          })
        : null
      const clientName = client
        ? `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim() || null
        : null
      await publishEvent(companyId, {
        type: 'conversation:transferred',
        conversationId: conversation.id,
        targetUserId: updates.transferredTo,
        status: 'active',
        clientName,
      })
    }

    return NextResponse.json(conversation)
  } catch (error) {
    return handleApiError(error, 'Erro ao atualizar conversa')
  }
}

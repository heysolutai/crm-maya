import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { z } from 'zod'

const replaceMembersSchema = z.object({
  userIds: z.array(z.string().uuid()),
})

/**
 * GET /api/agents/[id]/members
 *   Lista os atendentes (Users) que fazem parte desta inbox.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    const { id: inboxId } = await params

    // IDOR: garante que a inbox pertence a empresa
    const inbox = await prisma.inbox.findFirst({
      where: { id: inboxId, companyId },
      select: { id: true },
    })
    if (!inbox) return NextResponse.json({ error: 'Inbox nao encontrada' }, { status: 404 })

    const members = await prisma.inboxMember.findMany({
      where: { inboxId },
      include: {
        user: { select: { id: true, fullName: true, email: true, avatarUrl: true, isActive: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json(
      members.map((m) => ({
        id: m.id,
        inbox_id: m.inboxId,
        user_id: m.userId,
        created_at: m.createdAt,
        user: m.user
          ? {
              id: m.user.id,
              full_name: m.user.fullName,
              email: m.user.email,
              avatar_url: m.user.avatarUrl,
              is_active: m.user.isActive,
            }
          : null,
      }))
    )
  } catch (error) {
    return handleApiError(error, 'Erro ao listar membros da inbox')
  }
}

/**
 * PUT /api/agents/[id]/members
 *   Substitui toda a lista de membros (bulk replace).
 *   Body: { userIds: ["uuid1", "uuid2", ...] }
 *
 *   - Remove memberships que sumiram da lista
 *   - Adiciona memberships que entraram
 *   - Mantem inalteradas as que ja existiam
 *
 *   Valida que todos os user_ids pertencem a mesma empresa (anti-IDOR).
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    const { id: inboxId } = await params

    const inbox = await prisma.inbox.findFirst({
      where: { id: inboxId, companyId },
      select: { id: true },
    })
    if (!inbox) return NextResponse.json({ error: 'Inbox nao encontrada' }, { status: 404 })

    const body = await req.json()
    const validation = replaceMembersSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const incomingUserIds = [...new Set(validation.data.userIds)]

    // IDOR: valida que todos os user_ids pertencem a esta empresa
    if (incomingUserIds.length > 0) {
      const validUsers = await prisma.user.findMany({
        where: { id: { in: incomingUserIds }, companyId },
        select: { id: true },
      })
      if (validUsers.length !== incomingUserIds.length) {
        return NextResponse.json(
          { error: 'Um ou mais usuarios nao pertencem a esta empresa' },
          { status: 400 }
        )
      }
    }

    // Diff: pega o estado atual, calcula o que adiciona e o que remove
    const existing = await prisma.inboxMember.findMany({
      where: { inboxId },
      select: { userId: true },
    })
    const existingSet = new Set(existing.map((m) => m.userId))
    const incomingSet = new Set(incomingUserIds)

    const toRemove = [...existingSet].filter((u) => !incomingSet.has(u))
    const toAdd = incomingUserIds.filter((u) => !existingSet.has(u))

    await prisma.$transaction(async (tx) => {
      if (toRemove.length > 0) {
        await tx.inboxMember.deleteMany({
          where: { inboxId, userId: { in: toRemove } },
        })
      }
      if (toAdd.length > 0) {
        await tx.inboxMember.createMany({
          data: toAdd.map((userId) => ({ inboxId, userId })),
          skipDuplicates: true,
        })
      }
    })

    return NextResponse.json({
      success: true,
      added: toAdd.length,
      removed: toRemove.length,
      total: incomingUserIds.length,
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao atualizar membros da inbox')
  }
}

/**
 * DELETE /api/agents/[id]/members?userId=X
 *   Remove um membro especifico.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    const { id: inboxId } = await params
    const userId = req.nextUrl.searchParams.get('userId')
    if (!userId) return NextResponse.json({ error: 'userId obrigatorio' }, { status: 400 })

    const inbox = await prisma.inbox.findFirst({
      where: { id: inboxId, companyId },
      select: { id: true },
    })
    if (!inbox) return NextResponse.json({ error: 'Inbox nao encontrada' }, { status: 404 })

    await prisma.inboxMember.deleteMany({ where: { inboxId, userId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro ao remover membro')
  }
}

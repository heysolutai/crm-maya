import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

const updateTeamSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('updateRole'),
    userId: z.string().uuid('Invalid userId format'),
    role: z.enum(['company_admin', 'manager', 'agent', 'viewer']),
    companyId: z.string().uuid('Invalid companyId format').optional(),
  }),
  z.object({
    action: z.literal('toggleStatus'),
    userId: z.string().uuid('Invalid userId format'),
    isActive: z.boolean(),
    companyId: z.string().uuid('Invalid companyId format').optional(),
  }),
  z.object({
    action: z.literal('remove'),
    userId: z.string().uuid('Invalid userId format'),
    companyId: z.string().uuid('Invalid companyId format').optional(),
  }),
]);

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const members = await prisma.user.findMany({
      where: {
        companyId,
        userRoles: {
          some: {
            companyId,
            role: { in: ['company_admin', 'manager', 'agent', 'viewer'] },
          },
        },
      },
      include: {
        userRoles: {
          where: { companyId },
          select: { role: true, companyId: true },
        },
      },
      orderBy: { fullName: 'asc' },
    })

    // Normalize to snake_case for frontend compatibility
    const normalized = members.map(m => ({
      id: m.id,
      email: m.email,
      full_name: m.fullName,
      phone: m.phone,
      is_active: m.isActive,
      is_online: m.isOnline,
      last_seen_at: m.lastSeenAt,
      avatar_url: m.avatarUrl,
      created_at: m.createdAt,
      user_roles: m.userRoles.map(r => ({ role: r.role, company_id: r.companyId })),
    }))

    return NextResponse.json(normalized)
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    const body = await req.json()
    const validation = updateTeamSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid request data', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }

    const validatedBody = validation.data
    const { action } = validatedBody

    if (validatedBody.companyId && validatedBody.companyId !== companyId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }
    const targetCompanyId = validatedBody.companyId || companyId

    if (action === 'updateRole') {
      await prisma.userRole.updateMany({
        where: { userId: validatedBody.userId, companyId: targetCompanyId },
        data: { role: validatedBody.role },
      })
      return NextResponse.json({ success: true })
    }

    if (action === 'toggleStatus') {
      const user = await prisma.user.findFirst({
        where: { id: validatedBody.userId, companyId: targetCompanyId },
      })
      if (!user) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

      await prisma.user.update({
        where: { id: validatedBody.userId },
        data: { isActive: validatedBody.isActive },
      })
      return NextResponse.json({ success: true })
    }

    if (action === 'remove') {
      await prisma.userRole.deleteMany({
        where: { userId: validatedBody.userId, companyId: targetCompanyId },
      })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}

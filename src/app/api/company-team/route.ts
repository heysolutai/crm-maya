import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

const updateCompanyTeamSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('updateRole'),
    userId: z.string().uuid('Invalid userId format'),
    newRole: z.enum(['company_admin', 'manager', 'agent', 'viewer']),
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
    const { companyId: authCompanyId, isSuperAdmin } = await authenticate(req)
    const qsCompanyId = req.nextUrl.searchParams.get('companyId')
    // Isolamento multi-tenant: so super-admin pode consultar outra empresa;
    // usuario comum SEMPRE usa a propria (ignora ?companyId= adulterado).
    const companyId = isSuperAdmin ? (qsCompanyId || authCompanyId) : authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Nao autorizado' }, { status: 403 })

    // Get super admin IDs to exclude
    const superAdmins = await prisma.userRole.findMany({
      where: { role: 'super_admin', companyId: null },
      select: { userId: true },
    })
    const superAdminIds = superAdmins.map(sa => sa.userId)

    const members = await prisma.user.findMany({
      where: {
        companyId,
        id: { notIn: superAdminIds.length > 0 ? superAdminIds : ['__none__'] },
        userRoles: { some: { companyId } },
      },
      include: {
        userRoles: {
          where: { companyId },
          select: { role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Transform to expected format
    const result = members.map(m => ({
      id: m.id,
      email: m.email,
      full_name: m.fullName,
      phone: m.phone,
      avatar_url: m.avatarUrl,
      is_active: m.isActive,
      created_at: m.createdAt?.toISOString(),
      last_seen_at: m.lastSeenAt?.toISOString() || null,
      user_roles: m.userRoles.map(r => ({ role: r.role })),
    }))

    return NextResponse.json(result)
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await authenticate(req)
    const companyId = auth.companyId
    const body = await req.json()
    const validation = updateCompanyTeamSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid request data', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }

    const validatedBody = validation.data
    const { action } = validatedBody

    if (validatedBody.companyId && validatedBody.companyId !== companyId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }
    const targetCompanyId = validatedBody.companyId || companyId

    // Apenas company_admin (ou super-admin) pode gerenciar a equipe — evita que
    // qualquer membro (viewer/agent) se promova a admin ou remova o dono.
    const uid = auth.agentId
    const canManage = auth.isSuperAdmin || (!!uid && !!(await prisma.userRole.findFirst({
      where: { userId: uid, companyId: targetCompanyId, role: 'company_admin' },
      select: { userId: true },
    })))
    if (!canManage) {
      return NextResponse.json({ error: 'Apenas administradores podem gerenciar a equipe' }, { status: 403 })
    }

    if (action === 'updateRole') {
      await prisma.userRole.updateMany({
        where: { userId: validatedBody.userId, companyId: targetCompanyId },
        data: { role: validatedBody.newRole },
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

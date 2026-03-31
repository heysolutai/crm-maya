import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

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

    return NextResponse.json(members)
  } catch (error) {
    console.error('Erro:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
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
    console.error('Erro:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

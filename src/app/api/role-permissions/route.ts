import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

const updateRolePermissionSchema = z.object({
  companyId: z.string().uuid('Invalid companyId format'),
  role: z.enum(['company_admin', 'manager', 'agent', 'viewer']),
});

export async function GET(req: NextRequest) {
  try {
    await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const permissions = await prisma.rolePermission.findMany({
      where: { companyId },
      orderBy: { role: 'asc' },
    })
    return NextResponse.json(permissions)
  } catch (error) {
    console.error('Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await authenticate(req)
    const body = await req.json()

    // Validate required fields exist
    const baseValidation = updateRolePermissionSchema.safeParse({
      companyId: body.companyId,
      role: body.role,
    })

    if (!baseValidation.success) {
      return NextResponse.json({ error: 'Invalid request data', details: baseValidation.error.flatten().fieldErrors }, { status: 400 })
    }

    const { companyId, role, ...updates } = body

    await prisma.rolePermission.updateMany({
      where: { companyId, role },
      data: updates,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

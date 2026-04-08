import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

const updateRolePermissionSchema = z.object({
  role: z.enum(['company_admin', 'manager', 'agent', 'viewer']),
});

const DEFAULT_PERMISSIONS: Record<string, { conversationAccess: string; crmAccess: string; appointmentsAccess: string; salesAccess: string; canEditSettings: boolean }> = {
  company_admin: { conversationAccess: 'all', crmAccess: 'full', appointmentsAccess: 'full', salesAccess: 'full', canEditSettings: true },
  manager: { conversationAccess: 'all', crmAccess: 'full', appointmentsAccess: 'full', salesAccess: 'full', canEditSettings: false },
  agent: { conversationAccess: 'assigned_only', crmAccess: 'full', appointmentsAccess: 'full', salesAccess: 'read_only', canEditSettings: false },
  viewer: { conversationAccess: 'none', crmAccess: 'read_only', appointmentsAccess: 'read_only', salesAccess: 'none', canEditSettings: false },
}

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    let permissions = await prisma.rolePermission.findMany({
      where: { companyId },
      orderBy: { role: 'asc' },
    })

    // Auto-create default permissions if none exist
    if (permissions.length === 0) {
      const roles = ['company_admin', 'manager', 'agent', 'viewer'] as const
      for (const role of roles) {
        const defaults = DEFAULT_PERMISSIONS[role]
        await prisma.rolePermission.create({
          data: {
            companyId,
            role,
            ...defaults,
          },
        })
      }
      permissions = await prisma.rolePermission.findMany({
        where: { companyId },
        orderBy: { role: 'asc' },
      })
    }

    return NextResponse.json(permissions)
  } catch (error) {
    console.error('Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const body = await req.json()

    const baseValidation = updateRolePermissionSchema.safeParse({
      role: body.role,
    })

    if (!baseValidation.success) {
      return NextResponse.json({ error: 'Invalid request data', details: baseValidation.error.flatten().fieldErrors }, { status: 400 })
    }

    const { role, companyId: _ignore, ...updates } = body

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

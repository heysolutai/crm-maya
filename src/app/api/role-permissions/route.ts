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
    const { agentId, companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    if (!agentId) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 403 })

    // Só super_admin ou company_admin podem editar permissões de roles
    const isSuperAdmin = await prisma.userRole.findFirst({
      where: { userId: agentId, role: 'super_admin' },
    })
    if (!isSuperAdmin) {
      const isCompanyAdmin = await prisma.userRole.findFirst({
        where: { userId: agentId, role: 'company_admin', companyId },
      })
      if (!isCompanyAdmin) {
        return NextResponse.json({ error: 'Você não tem permissão para alterar permissões de roles' }, { status: 403 })
      }
    }

    const body = await req.json()

    const baseValidation = updateRolePermissionSchema.safeParse({
      role: body.role,
    })

    if (!baseValidation.success) {
      return NextResponse.json({ error: 'Invalid request data', details: baseValidation.error.flatten().fieldErrors }, { status: 400 })
    }

    const { role } = body

    // Mapeia os campos snake_case (frontend) para camelCase (Prisma).
    // Aceita ambos os formatos por segurança.
    const data: Record<string, unknown> = {}
    const conversationAccess = body.conversation_access ?? body.conversationAccess
    const crmAccess = body.crm_access ?? body.crmAccess
    const appointmentsAccess = body.appointments_access ?? body.appointmentsAccess
    const salesAccess = body.sales_access ?? body.salesAccess
    const canEditSettings = body.can_edit_settings ?? body.canEditSettings

    if (conversationAccess !== undefined) data.conversationAccess = conversationAccess
    if (crmAccess !== undefined) data.crmAccess = crmAccess
    if (appointmentsAccess !== undefined) data.appointmentsAccess = appointmentsAccess
    if (salesAccess !== undefined) data.salesAccess = salesAccess
    if (canEditSettings !== undefined) data.canEditSettings = canEditSettings

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo válido para atualizar' }, { status: 400 })
    }

    // Upsert: se não existir a permissão para essa role, cria com defaults e aplica as mudanças
    const existing = await prisma.rolePermission.findFirst({
      where: { companyId, role },
    })

    if (existing) {
      await prisma.rolePermission.update({
        where: { id: existing.id },
        data,
      })
    } else {
      const defaults = DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.viewer
      await prisma.rolePermission.create({
        data: { companyId, role, ...defaults, ...data },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[PUT /api/role-permissions] Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

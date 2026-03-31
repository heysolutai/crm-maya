import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  try {
    const { isSuperAdmin } = await authenticate(req)
    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const users = await prisma.user.findMany({
      select: {
        id: true, email: true, fullName: true, companyId: true,
        isActive: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    const roles = await prisma.userRole.findMany({
      select: { userId: true, role: true },
    })

    const companies = await prisma.company.findMany({
      select: { id: true, name: true },
    })

    const rolesMap: Record<string, string[]> = {}
    for (const r of roles) {
      if (!rolesMap[r.userId]) rolesMap[r.userId] = []
      rolesMap[r.userId].push(r.role)
    }

    const companiesMap: Record<string, string> = {}
    for (const c of companies) companiesMap[c.id] = c.name

    const result = users.map(u => ({
      id: u.id,
      email: u.email,
      full_name: u.fullName,
      company_id: u.companyId,
      company_name: u.companyId ? companiesMap[u.companyId] || null : null,
      is_active: u.isActive ?? true,
      roles: rolesMap[u.id] || [],
      created_at: u.createdAt?.toISOString() || '',
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

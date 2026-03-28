import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  try {
    await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

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
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await authenticate(req)
    const body = await req.json()
    const { action } = body

    if (action === 'updateRole') {
      await prisma.userRole.updateMany({
        where: { userId: body.userId, companyId: body.companyId },
        data: { role: body.newRole },
      })
      return NextResponse.json({ success: true })
    }

    if (action === 'toggleStatus') {
      await prisma.user.update({
        where: { id: body.userId },
        data: { isActive: !body.isActive },
      })
      return NextResponse.json({ success: true })
    }

    if (action === 'remove') {
      await prisma.userRole.deleteMany({
        where: { userId: body.userId, companyId: body.companyId },
      })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

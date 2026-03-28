import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

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
        data: { role: body.role },
      })
      return NextResponse.json({ success: true })
    }

    if (action === 'toggleStatus') {
      await prisma.user.update({
        where: { id: body.userId },
        data: { isActive: body.isActive },
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

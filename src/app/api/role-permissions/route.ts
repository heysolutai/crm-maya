import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

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
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await authenticate(req)
    const body = await req.json()
    const { companyId, role, ...updates } = body

    if (!companyId || !role) {
      return NextResponse.json({ error: 'Missing companyId or role' }, { status: 400 })
    }

    await prisma.rolePermission.updateMany({
      where: { companyId, role },
      data: updates,
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

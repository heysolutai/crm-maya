import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  try {
    const { isSuperAdmin } = await authenticate(req)
    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Super admin access required' }, { status: 403 })
    }

    const roles = await prisma.userRole.findMany({
      where: { role: 'super_admin', companyId: null },
      include: {
        user: { select: { email: true, fullName: true } },
      },
    })

    const superAdmins = roles.map((item) => ({
      id: item.id,
      user_id: item.userId,
      email: item.user?.email || '',
      full_name: item.user?.fullName,
      created_at: item.createdAt.toISOString(),
    }))

    return NextResponse.json(superAdmins)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { isSuperAdmin } = await authenticate(req)
    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Super admin access required' }, { status: 403 })
    }

    const { email } = await req.json()

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, email: true },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Usuário não encontrado. O usuário precisa criar uma conta primeiro.' },
        { status: 404 }
      )
    }

    // Check if already super_admin
    const existing = await prisma.userRole.findFirst({
      where: { userId: user.id, role: 'super_admin', companyId: null },
    })

    if (existing) {
      return NextResponse.json({ error: 'Este usuário já é um Super Admin.' }, { status: 409 })
    }

    // Add super_admin role
    await prisma.userRole.create({
      data: { userId: user.id, role: 'super_admin', companyId: null },
    })

    return NextResponse.json(user)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { isSuperAdmin, agentId } = await authenticate(req)
    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Super admin access required' }, { status: 403 })
    }

    const userId = req.nextUrl.searchParams.get('userId')
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    if (userId === agentId) {
      return NextResponse.json({ error: 'Você não pode remover a si próprio.' }, { status: 400 })
    }

    await prisma.userRole.deleteMany({
      where: { userId, role: 'super_admin', companyId: null },
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

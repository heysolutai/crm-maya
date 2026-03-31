import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

export async function POST(req: NextRequest) {
  try {
    await authenticate(req)
    const body = await req.json()
    const { departmentId, userId, role = 'member' } = body

    if (!departmentId || !userId) {
      return NextResponse.json({ error: 'Missing departmentId or userId' }, { status: 400 })
    }

    const member = await prisma.departmentMember.create({
      data: { departmentId, userId, role },
    })
    return NextResponse.json(member)
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'User is already a member of this department' }, { status: 409 })
    }
    console.error('Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await authenticate(req)
    const body = await req.json()
    const { departmentId, userId, role } = body

    if (!departmentId || !userId) {
      return NextResponse.json({ error: 'Missing departmentId or userId' }, { status: 400 })
    }

    const member = await prisma.departmentMember.updateMany({
      where: { departmentId, userId },
      data: { role },
    })
    return NextResponse.json(member)
  } catch (error) {
    console.error('Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await authenticate(req)
    const departmentId = req.nextUrl.searchParams.get('departmentId')
    const userId = req.nextUrl.searchParams.get('userId')

    if (!departmentId || !userId) {
      return NextResponse.json({ error: 'Missing departmentId or userId' }, { status: 400 })
    }

    await prisma.departmentMember.deleteMany({
      where: { departmentId, userId },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

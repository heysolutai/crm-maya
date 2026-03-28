import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId, isSuperAdmin } = await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const clients = await prisma.client.findMany({
      where: { companyId },
      include: {
        appointments: { select: { id: true, scheduledFor: true, status: true } },
        sales: { select: { id: true, totalAmount: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    })

    return NextResponse.json(clients)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const body = await req.json()
    const companyId = body.company_id || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const { full_name, company_id, ...data } = body
    const client = await prisma.client.create({
      data: {
        ...data,
        companyId,
        firstName: data.first_name || data.firstName,
        lastName: data.last_name || data.lastName,
      },
    })

    return NextResponse.json(client)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await authenticate(req)
    const body = await req.json()
    const { id, full_name, ...data } = body

    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const client = await prisma.client.update({
      where: { id },
      data,
    })

    return NextResponse.json(client)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await authenticate(req)
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    await prisma.client.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

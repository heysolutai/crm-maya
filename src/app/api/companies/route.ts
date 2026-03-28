import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  try {
    const { isSuperAdmin, companyId: authCompanyId } = await authenticate(req)

    // Single company lookup by ID
    const singleId = req.nextUrl.searchParams.get('id')
    if (singleId) {
      const company = await prisma.company.findUnique({ where: { id: singleId } })
      return NextResponse.json(company)
    }

    // List all companies (super admin only)
    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const companies = await prisma.company.findMany({
      orderBy: { createdAt: 'desc' },
    })

    const waInstances = await prisma.whatsappInstance.findMany({
      select: { companyId: true, metadata: true },
    })

    const phoneMap: Record<string, string> = {}
    for (const inst of waInstances) {
      const phone = (inst.metadata as any)?.connected_phone
      if (phone && typeof phone === 'string' && phone.length >= 10) {
        phoneMap[inst.companyId] = phone
      }
    }

    const result = companies.map(c => ({
      ...c,
      whatsapp_phone: phoneMap[c.id] || null,
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
    const { id, ...updates } = body
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const company = await prisma.company.update({ where: { id }, data: updates })
    return NextResponse.json(company)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { isSuperAdmin } = await authenticate(req)
    if (!isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    // Use raw query for cascade delete
    await prisma.$executeRaw`SELECT delete_company_cascade(${id}::uuid)`
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

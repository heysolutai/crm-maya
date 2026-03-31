import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

const updateCompanySchema = z.object({
  id: z.string().uuid('Invalid id format'),
}).passthrough();

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
  } catch (error) {
    console.error('Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await authenticate(req)
    const body = await req.json()
    const validation = updateCompanySchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid request data', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }

    const { id, ...updates } = validation.data
    const company = await prisma.company.update({ where: { id }, data: updates })
    return NextResponse.json(company)
  } catch (error) {
    console.error('Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
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
  } catch (error) {
    console.error('Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

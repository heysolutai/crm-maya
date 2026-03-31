import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

const updateFollowUpJobSchema = z.object({
  id: z.string().uuid(),
  status: z.string().optional(),
  scheduledFor: z.string().datetime({ offset: true }).or(z.string().min(1)).optional(),
  message: z.string().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId, isSuperAdmin } = await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId

    if (!isSuperAdmin && !companyId) {
      return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    }

    const status = req.nextUrl.searchParams.get('status')
    const filterCompanyId = req.nextUrl.searchParams.get('filterCompanyId')
    const clientSearch = req.nextUrl.searchParams.get('clientSearch')
    const dateFrom = req.nextUrl.searchParams.get('dateFrom')
    const dateTo = req.nextUrl.searchParams.get('dateTo')

    const where: any = {}
    if (companyId) where.companyId = companyId
    if (filterCompanyId) where.companyId = filterCompanyId
    if (status && status !== 'all') where.status = status
    if (dateFrom) where.scheduledFor = { ...where.scheduledFor, gte: new Date(dateFrom) }
    if (dateTo) where.scheduledFor = { ...where.scheduledFor, lte: new Date(dateTo) }

    if (clientSearch) {
      const clients = await prisma.client.findMany({
        where: {
          OR: [
            { firstName: { contains: clientSearch, mode: 'insensitive' } },
            { phone: { contains: clientSearch } },
          ],
        },
        select: { id: true },
      })
      if (clients.length > 0) {
        where.clientId = { in: clients.map((c) => c.id) }
      } else {
        return NextResponse.json([])
      }
    }

    const jobs = await prisma.followUpJob.findMany({
      where,
      include: {
        client: { select: { firstName: true, lastName: true, phone: true } },
        company: { select: { name: true } },
        conversation: { select: { startedAt: true } },
      },
      orderBy: { scheduledFor: 'desc' },
    })

    return NextResponse.json(jobs)
  } catch (error) {
    console.error('Erro:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    const body = await req.json()

    const validation = updateFollowUpJobSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { id, ...data } = validation.data

    const existing = await prisma.followUpJob.findFirst({ where: { id, companyId } })
    if (!existing) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    const job = await prisma.followUpJob.update({
      where: { id },
      data,
    })
    return NextResponse.json(job)
  } catch (error) {
    console.error('Erro:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

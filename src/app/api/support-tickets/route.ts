import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId, isSuperAdmin } = await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId

    if (!companyId && !isSuperAdmin) {
      return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    }

    // Super admin: fetch ticket counts grouped by company (for CompaniesTable)
    if (isSuperAdmin && req.nextUrl.searchParams.get('counts') === 'true') {
      const tickets = await prisma.supportTicket.findMany({
        where: { status: { in: ['open', 'in_progress'] } },
        select: { companyId: true, status: true, createdAt: true },
      })
      const counts: Record<string, { open: number; in_progress: number; oldest: string }> = {}
      for (const t of tickets) {
        if (!counts[t.companyId]) counts[t.companyId] = { open: 0, in_progress: 0, oldest: t.createdAt.toISOString() }
        if (t.status === 'open') counts[t.companyId].open++
        if (t.status === 'in_progress') counts[t.companyId].in_progress++
        if (t.createdAt.toISOString() < counts[t.companyId].oldest) counts[t.companyId].oldest = t.createdAt.toISOString()
      }
      return NextResponse.json(counts)
    }

    const tickets = await prisma.supportTicket.findMany({
      where: companyId ? { companyId } : undefined,
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(tickets)
  } catch (error) {
    console.error('Erro:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { agentId, companyId } = await authenticate(req)
    const body = await req.json()

    if (body.action === 'create') {
      const ticket = await prisma.supportTicket.create({
        data: {
          companyId: companyId || body.companyId,
          createdBy: agentId || '',
          subject: body.subject,
          description: body.description,
          screenshotPaths: body.screenshotPaths || [],
          priority: body.priority || 'medium',
        },
      })
      return NextResponse.json(ticket)
    }

    if (body.action === 'updateStatus') {
      if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

      const existing = await prisma.supportTicket.findFirst({ where: { id: body.ticketId, companyId } })
      if (!existing) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

      const updateData: any = { status: body.status, updatedAt: new Date() }
      if (body.status === 'resolved') {
        updateData.resolvedAt = new Date()
        updateData.resolvedBy = agentId ?? undefined
      }
      if (body.adminNotes !== undefined) {
        updateData.adminNotes = body.adminNotes
      }

      await prisma.supportTicket.update({
        where: { id: body.ticketId },
        data: updateData,
      })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Erro:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

export async function POST(req: NextRequest) {
  try {
    const { agentId, companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    const body = await req.json()
    const { action } = body

    // Delete an appointment — IDOR: scope by companyId
    if (action === 'deleteAppointment') {
      const result = await prisma.appointment.deleteMany({
        where: { id: body.appointmentId, companyId },
      })
      if (result.count === 0) {
        return NextResponse.json({ error: 'Agendamento nao encontrado' }, { status: 404 })
      }
      return NextResponse.json({ success: true })
    }

    // Update client source (for entrantes) — IDOR: scope by companyId
    if (action === 'updateClientSource') {
      const result = await prisma.client.updateMany({
        where: { id: body.clientId, companyId },
        data: { source: body.source },
      })
      if (result.count === 0) {
        return NextResponse.json({ error: 'Cliente nao encontrado' }, { status: 404 })
      }
      return NextResponse.json({ success: true })
    }

    // Create an appointment — IDOR: garante que clientId pertence a empresa
    if (action === 'createAppointment') {
      const client = await prisma.client.findFirst({
        where: { id: body.clientId, companyId },
        select: { id: true },
      })
      if (!client) {
        return NextResponse.json({ error: 'Cliente nao encontrado' }, { status: 404 })
      }
      const appointment = await prisma.appointment.create({
        data: {
          clientId: body.clientId,
          companyId,
          title: body.title,
          scheduledFor: new Date(body.scheduledFor),
          status: body.status || 'scheduled',
          notes: body.notes || null,
          createdBy: agentId,
        },
        select: { id: true },
      })
      return NextResponse.json({ success: true, id: appointment.id })
    }

    // Update appointment status — IDOR: scope by companyId
    if (action === 'updateAppointmentStatus') {
      const result = await prisma.appointment.updateMany({
        where: { id: body.appointmentId, companyId },
        data: { status: body.status },
      })
      if (result.count === 0) {
        return NextResponse.json({ error: 'Agendamento nao encontrado' }, { status: 404 })
      }
      return NextResponse.json({ success: true })
    }

    // Create a sale — IDOR: garante que clientId pertence a empresa
    if (action === 'createSale') {
      const client = await prisma.client.findFirst({
        where: { id: body.clientId, companyId },
        select: { id: true },
      })
      if (!client) {
        return NextResponse.json({ error: 'Cliente nao encontrado' }, { status: 404 })
      }
      const sale = await prisma.sale.create({
        data: {
          companyId,
          clientId: body.clientId,
          soldBy: agentId,
          saleNumber: body.saleNumber,
          items: body.items,
          subtotal: body.subtotal,
          status: body.status || 'approved',
        },
        select: { id: true },
      })
      return NextResponse.json({ success: true, id: sale.id })
    }

    // Create a new client
    if (action === 'createClient') {
      const client = await prisma.client.create({
        data: {
          firstName: body.firstName,
          lastName: body.lastName || null,
          phone: body.phone || null,
          companyId,
          source: body.source || 'manual_report',
          createdBy: agentId,
        },
        select: { id: true },
      })
      return NextResponse.json({ success: true, id: client.id })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    return handleApiError(error, 'Erro')}
}

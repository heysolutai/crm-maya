import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

export async function POST(req: NextRequest) {
  try {
    const { agentId, companyId: authCompanyId } = await authenticate(req)
    const body = await req.json()
    const companyId = body.companyId || authCompanyId
    const { action } = body

    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    // Delete an appointment
    if (action === 'deleteAppointment') {
      await prisma.appointment.delete({ where: { id: body.appointmentId } })
      return NextResponse.json({ success: true })
    }

    // Update client source (for entrantes)
    if (action === 'updateClientSource') {
      await prisma.client.update({
        where: { id: body.clientId },
        data: { source: body.source },
      })
      return NextResponse.json({ success: true })
    }

    // Create an appointment
    if (action === 'createAppointment') {
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

    // Update appointment status
    if (action === 'updateAppointmentStatus') {
      await prisma.appointment.update({
        where: { id: body.appointmentId },
        data: { status: body.status },
      })
      return NextResponse.json({ success: true })
    }

    // Create a sale
    if (action === 'createSale') {
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
    console.error('Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

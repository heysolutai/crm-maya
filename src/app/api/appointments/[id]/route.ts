import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { handleCors, jsonResponse } from '@/lib/api/cors';
import { apiError, apiSuccess, formatWithBrazilOffset, authenticateApiKey, syncWithGoogleCalendar } from '@/lib/api/appointments-helpers';

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authenticateApiKey(req);
    if ('error' in auth) return auth.error;
    const { company } = auth;

    const appointment = await prisma.appointment.findFirst({
      where: { id, companyId: company.id },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
        assignee: { select: { id: true, fullName: true } },
      },
    });

    if (!appointment) return apiError('Agendamento não encontrado.', 'NOT_FOUND', 200);
    return apiSuccess({ ...appointment, scheduled_for: formatWithBrazilOffset(new Date(appointment.scheduledFor)) });
  } catch (error) {
    return apiError('Erro interno.', 'INTERNAL_ERROR', 200);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authenticateApiKey(req);
    if ('error' in auth) return auth.error;
    const { company } = auth;
    const reason = req.nextUrl.searchParams.get('reason');

    const existing = await prisma.appointment.findFirst({
      where: { id, companyId: company.id },
    });

    if (!existing) return apiError('Agendamento não encontrado.', 'NOT_FOUND', 200);
    if (existing.status === 'cancelled') return apiError('Já cancelado.', 'ALREADY_CANCELLED', 200);

    const cancelled = await prisma.appointment.update({
      where: { id },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason: reason || 'Cancelado via API',
      },
    });

    await prisma.reminder.updateMany({
      where: { appointmentId: id, status: 'pending' },
      data: { status: 'cancelled' },
    });

    syncWithGoogleCalendar(company.id, id, 'delete', existing.googleEventId);
    return apiSuccess(cancelled);
  } catch (error) {
    return apiError('Erro interno.', 'INTERNAL_ERROR', 200);
  }
}

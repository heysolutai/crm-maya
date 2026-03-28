import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { handleCors, jsonResponse } from '@/lib/api/cors';
import { apiError, apiSuccess, authenticateApiKey, syncWithGoogleCalendar } from '@/lib/api/appointments-helpers';

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authenticateApiKey(req);
    if ('error' in auth) return auth.error;
    const { company } = auth;

    const { new_scheduled_for, new_duration_minutes, reason } = await req.json();
    if (!new_scheduled_for) return apiError('new_scheduled_for é obrigatório.', 'MISSING_NEW_DATE', 200);

    const existing = await prisma.appointment.findFirst({
      where: { id, companyId: company.id },
    });
    if (!existing) return apiError('Agendamento não encontrado.', 'NOT_FOUND', 200);
    if (existing.status === 'cancelled') return apiError('Não é possível remarcar cancelado.', 'CANCELLED', 200);

    const duration = new_duration_minutes || existing.durationMinutes;

    // Check for conflicts
    const scheduledDate = new Date(new_scheduled_for);
    const conflictEnd = new Date(scheduledDate.getTime() + duration * 60 * 1000);
    const conflictWhere: any = {
      companyId: company.id,
      status: { not: 'cancelled' },
      id: { not: id },
      scheduledFor: { lt: conflictEnd, gte: new Date(scheduledDate.getTime() - 24 * 60 * 60 * 1000) },
    };
    if (existing.assignedTo) conflictWhere.assignedTo = existing.assignedTo;

    const conflicting = await prisma.appointment.findFirst({
      where: conflictWhere,
      include: { client: { select: { firstName: true, lastName: true } } },
    });

    if (conflicting) {
      const conflictingEnd = new Date(new Date(conflicting.scheduledFor).getTime() + (conflicting.durationMinutes || 60) * 60 * 1000);
      if (scheduledDate < conflictingEnd && conflictEnd > new Date(conflicting.scheduledFor)) {
        const name = conflicting.client ? `${conflicting.client.firstName || ''} ${conflicting.client.lastName || ''}`.trim() : 'outro cliente';
        return apiError(`Horário ocupado por ${name}.`, 'CONFLICT', 200);
      }
    }

    const updateData: any = {
      scheduledFor: new Date(new_scheduled_for),
      durationMinutes: duration,
      updatedAt: new Date(),
    };
    if (reason) updateData.notes = existing.notes ? `${existing.notes}\n\n[Remarcado] ${reason}` : `[Remarcado] ${reason}`;

    const updated = await prisma.appointment.update({
      where: { id },
      data: updateData,
      include: { client: { select: { firstName: true, lastName: true } } },
    });

    syncWithGoogleCalendar(company.id, id, 'update', existing.googleEventId);
    return apiSuccess(updated);
  } catch (error) {
    return apiError('Erro interno.', 'INTERNAL_ERROR', 200);
  }
}

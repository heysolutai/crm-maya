import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { handleCors, jsonResponse } from '@/lib/api/cors';
import {
  apiError, apiSuccess, formatWithBrazilOffset, defaultBusinessHours,
  getEffectiveAppointmentSettings, authenticateApiKey, syncWithGoogleCalendar,
} from '@/lib/api/appointments-helpers';
import { handleApiErrorCors } from '@/lib/api/errors';

export async function OPTIONS(req: NextRequest) {
  return handleCors(req) || jsonResponse(null);
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateApiKey(req);
    if ('error' in auth) return auth.error;
    const { company } = auth;
    const companyId = company.id;
    const url = req.nextUrl;

    const status = url.searchParams.get('status');
    let clientId = url.searchParams.get('client_id');
    const phone = url.searchParams.get('phone');
    const dateFrom = url.searchParams.get('date_from');
    const dateTo = url.searchParams.get('date_to');
    const assignedTo = url.searchParams.get('assigned_to');
    const scheduleId = url.searchParams.get('schedule_id');

    if (!clientId && phone) {
      const normalizedPhone = phone.replace(/\D/g, '');
      const phoneSuffix = normalizedPhone.slice(-8).replace(/[,.()\\'"%]/g, '');
      const clientByPhone = await prisma.client.findFirst({
        where: {
          companyId,
          OR: [
            { phone: normalizedPhone },
            { phone: { contains: phoneSuffix } },
          ],
        },
        select: { id: true },
      });
      if (!clientByPhone) return apiSuccess({ appointments: [], message: `Nenhum cliente encontrado com o telefone ${phone}.` });
      clientId = clientByPhone.id;
    }

    const whereClause: any = { companyId };
    if (status) whereClause.status = status;
    if (clientId) whereClause.clientId = clientId;
    if (assignedTo) whereClause.assignedTo = assignedTo;
    if (scheduleId) whereClause.scheduleId = scheduleId;
    if (dateFrom || dateTo) {
      whereClause.scheduledFor = {};
      if (dateFrom) whereClause.scheduledFor.gte = new Date(dateFrom);
      if (dateTo) whereClause.scheduledFor.lte = new Date(dateTo);
    }

    const appointments = await prisma.appointment.findMany({
      where: whereClause,
      include: {
        client: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
        assignee: { select: { id: true, fullName: true } },
        schedule: { select: { id: true, name: true, color: true } },
      },
      orderBy: { scheduledFor: 'asc' },
    });

    if (!appointments?.length) return apiSuccess({ appointments: [], message: 'Nenhum agendamento encontrado.' });

    return apiSuccess({
      appointments: appointments.map(a => ({ ...a, scheduled_for: formatWithBrazilOffset(new Date(a.scheduledFor)) })),
      message: `${appointments.length} agendamento(s) encontrado(s).`,
    });
  } catch (error) {
    return handleApiErrorCors(error, '[appointments GET]')
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateApiKey(req);
    if ('error' in auth) return auth.error;
    const { company, settings } = auth;
    const companyId = company.id;

    // Lemos o body como texto primeiro pra poder logar o payload quando o JSON quebrar.
    const rawBody = await req.text();
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch (parseErr) {
      console.error('[appointments POST] JSON invalido. Body recebido:\n', rawBody);
      return apiError('Body da requisicao nao e um JSON valido.', 'INVALID_JSON', 200);
    }
    const { client_id, phone, title, scheduled_for, duration_minutes = 60, assigned_to, schedule_id, location, description, notes, patient_name } = body;

    if (!title || !scheduled_for) return apiError('Campos obrigatórios: title, scheduled_for.', 'MISSING_FIELDS', 200);
    if (!client_id && !phone) return apiError('Informe client_id ou phone.', 'MISSING_CLIENT_IDENTIFIER', 200);

    let resolvedClientId = client_id;
    if (!resolvedClientId && phone) {
      const normalizedPhone = phone.replace(/\D/g, '');
      const phoneSuffix = normalizedPhone.slice(-8).replace(/[,.()\\'"%]/g, '');
      const c = await prisma.client.findFirst({
        where: {
          companyId,
          OR: [
            { phone: normalizedPhone },
            { phone: { contains: phoneSuffix } },
          ],
        },
        select: { id: true },
      });
      if (!c) return apiError(`Cliente com telefone ${phone} não encontrado.`, 'CLIENT_NOT_FOUND', 200);
      resolvedClientId = c.id;
    }

    const apptSettings = getEffectiveAppointmentSettings(settings.appointment_settings);
    const rawDateTime = scheduled_for.replace(/[Zz]$/, '').replace(/[+-]\d{2}:\d{2}$/, '').replace(/[+-]\d{4}$/, '');
    const scheduledDate = new Date(rawDateTime + '-03:00');
    const normalizedScheduledFor = scheduledDate.toISOString();

    const now = new Date();
    const minNoticeTime = new Date(now.getTime() + apptSettings.min_notice_hours * 60 * 60 * 1000);
    if (scheduledDate < minNoticeTime) {
      return apiError(`Agendamento requer pelo menos ${apptSettings.min_notice_hours}h de antecedência.`, 'MIN_NOTICE', 200);
    }

    const maxAdvanceTime = new Date(now.getTime() + apptSettings.advance_booking_days * 24 * 60 * 60 * 1000);
    if (scheduledDate > maxAdvanceTime) {
      return apiError(`Máximo de ${apptSettings.advance_booking_days} dias de antecedência.`, 'MAX_ADVANCE', 200);
    }

    // Check for conflicts using raw query (replaces supabase.rpc)
    const conflictEnd = new Date(scheduledDate.getTime() + duration_minutes * 60 * 1000);
    const conflictWhere: any = {
      companyId,
      status: { not: 'cancelled' },
      scheduledFor: { lt: conflictEnd },
    };
    if (assigned_to) conflictWhere.assignedTo = assigned_to;

    const conflicting = await prisma.appointment.findFirst({
      where: {
        ...conflictWhere,
        AND: {
          scheduledFor: { gte: new Date(scheduledDate.getTime() - 24 * 60 * 60 * 1000) },
        },
      },
      include: { client: { select: { firstName: true, lastName: true } } },
    });

    if (conflicting) {
      const conflictingEnd = new Date(new Date(conflicting.scheduledFor).getTime() + (conflicting.durationMinutes || 60) * 60 * 1000);
      if (scheduledDate < conflictingEnd && conflictEnd > new Date(conflicting.scheduledFor)) {
        const name = conflicting.client ? `${conflicting.client.firstName || ''} ${conflicting.client.lastName || ''}`.trim() : 'outro cliente';
        return apiError(`Horário já ocupado por ${name}.`, 'CONFLICT', 200);
      }
    }

    // If schedule_id provided, validate (fail-loud) and auto-resolve assignedTo
    let resolvedScheduleId: string | null = null;
    let resolvedAssignedTo: string | null = assigned_to || null;
    if (schedule_id !== undefined && schedule_id !== null && schedule_id !== '') {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(String(schedule_id))) {
        return apiError(`schedule_id invalido: "${schedule_id}" nao e um UUID.`, 'INVALID_SCHEDULE_ID', 200);
      }
      const schedule = await prisma.doctorSchedule.findFirst({
        where: { id: schedule_id, companyId },
      });
      if (!schedule) {
        return apiError(`Agenda ${schedule_id} nao encontrada nesta empresa.`, 'SCHEDULE_NOT_FOUND', 200);
      }
      resolvedScheduleId = schedule.id;
      if (!resolvedAssignedTo) resolvedAssignedTo = schedule.userId;
    }

    const appointment = await prisma.appointment.create({
      data: {
        companyId,
        clientId: resolvedClientId,
        scheduleId: resolvedScheduleId,
        title,
        scheduledFor: new Date(normalizedScheduledFor),
        durationMinutes: duration_minutes,
        assignedTo: resolvedAssignedTo,
        location: location || null,
        description: description || null,
        notes: notes || null,
        patientName: patient_name || null,
        status: 'scheduled',
        createdBy: null,
      },
      include: {
        client: { select: { firstName: true, lastName: true } },
      },
    });

    syncWithGoogleCalendar(companyId, appointment.id, 'create');
    return apiSuccess(appointment, 201);
  } catch (error) {
    return handleApiErrorCors(error, '[appointments POST]')
  }
}

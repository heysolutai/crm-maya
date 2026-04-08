import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/api/auth";
import {
  formatWithBrazilOffset,
  defaultBusinessHours,
  getEffectiveAppointmentSettings,
} from "@/lib/api/appointments-helpers";
import type { AppointmentSettings, BusinessHours } from "@/lib/api/appointments-helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate(req);
  const companyId = auth.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const url = req.nextUrl;
    const date = url.searchParams.get("date");
    const requestedDuration = parseInt(url.searchParams.get("duration_minutes") ?? "", 10);

    if (!date) {
      return NextResponse.json({ error: "Parâmetro date é obrigatório (YYYY-MM-DD)" }, { status: 400 });
    }

    // Load schedule with company fallback
    const schedule = await prisma.doctorSchedule.findFirst({
      where: { id, companyId: companyId },
      include: {
        company: { select: { settings: true } },
      },
    });

    if (!schedule) {
      return NextResponse.json({ error: "Agenda não encontrada" }, { status: 404 });
    }

    // Use schedule-specific settings, falling back to company settings
    const companySettings = (schedule.company.settings || {}) as Record<string, unknown>;
    const scheduleBusinessHours = schedule.businessHours as Record<string, BusinessHours> | null;
    const scheduleApptSettings = schedule.appointmentSettings as Partial<AppointmentSettings> | null;

    const businessHours = (scheduleBusinessHours && Object.keys(scheduleBusinessHours).length > 0)
      ? scheduleBusinessHours
      : (companySettings.business_hours as Record<string, BusinessHours>) || defaultBusinessHours;

    const apptSettings = getEffectiveAppointmentSettings(
      (scheduleApptSettings && Object.keys(scheduleApptSettings).length > 0)
        ? scheduleApptSettings
        : companySettings.appointment_settings as Partial<AppointmentSettings> | undefined
    );

    const effectiveDuration = Number.isFinite(requestedDuration) && requestedDuration > 0
      ? requestedDuration
      : apptSettings.default_duration_minutes;

    const requestedDate = new Date(date);
    const dayOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][requestedDate.getDay()];
    const dayHours = businessHours[dayOfWeek];

    if (!dayHours?.enabled) {
      return NextResponse.json({ data: { date, available_slots: [], message: "Dia não útil para este profissional." } });
    }

    // Check company holidays
    const holidays = (companySettings.holidays || []) as Array<{ date: string; name: string }>;
    if (holidays.some(h => h.date === date)) {
      return NextResponse.json({ data: { date, available_slots: [], message: "Feriado." } });
    }

    const BRAZIL_OFFSET = -3;
    const [year, month, day] = date.split("-").map(Number);
    const [startHour, startMinute] = dayHours.start.split(":").map(Number);
    const [endHour, endMinute] = dayHours.end.split(":").map(Number);

    const dayStart = new Date(Date.UTC(year, month - 1, day, 0 - BRAZIL_OFFSET, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(year, month - 1, day, 23 - BRAZIL_OFFSET, 59, 59, 999));

    // Fetch existing appointments for this schedule (or this user)
    const existing = await prisma.appointment.findMany({
      where: {
        companyId: companyId,
        scheduledFor: { gte: dayStart, lte: dayEnd },
        status: { not: "cancelled" },
        OR: [
          { scheduleId: id },
          { assignedTo: schedule.userId },
        ],
      },
      select: {
        id: true,
        scheduledFor: true,
        durationMinutes: true,
      },
    });

    const bufferMs = (apptSettings.buffer_between_appointments_minutes || 0) * 60 * 1000;
    const checkConflict = (slotStart: Date, slotEnd: Date): boolean => {
      for (const a of existing) {
        const aStart = new Date(a.scheduledFor);
        const aEnd = new Date(aStart.getTime() + (a.durationMinutes || 60) * 60 * 1000 + bufferMs);
        if (slotStart < aEnd && slotEnd > aStart) return true;
      }
      return false;
    };

    const available_slots: string[] = [];
    let current = new Date(Date.UTC(year, month - 1, day, startHour - BRAZIL_OFFSET, startMinute, 0, 0));
    const endTime = new Date(Date.UTC(year, month - 1, day, endHour - BRAZIL_OFFSET, endMinute, 0, 0));
    const now = new Date();
    const minNotice = new Date(now.getTime() + apptSettings.min_notice_hours * 60 * 60 * 1000);

    while (current < endTime) {
      const slotEnd = new Date(current.getTime() + effectiveDuration * 60 * 1000);
      if (slotEnd <= endTime && current >= minNotice) {
        if (!checkConflict(current, slotEnd)) {
          const brazilTime = formatWithBrazilOffset(current);
          available_slots.push(brazilTime.slice(11, 16));
        }
      }
      current = new Date(current.getTime() + effectiveDuration * 60 * 1000);
    }

    return NextResponse.json({
      data: {
        date,
        schedule_id: id,
        professional: schedule.name,
        available_slots,
        message: available_slots.length > 0
          ? `${available_slots.length} horario(s) disponivel(is).`
          : "Nenhum horario disponivel nesta data.",
      },
    });
  } catch (error) {
    console.error("Erro ao buscar slots da agenda:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

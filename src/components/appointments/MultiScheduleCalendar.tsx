"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DoctorSchedule } from "@/hooks/useSchedules";

interface Appointment {
  id: string;
  title: string;
  scheduled_for: string;
  duration_minutes: number;
  status: string;
  assigned_to?: string;
  schedule_id?: string;
  schedule?: { id: string; name: string; color: string } | null;
  clients?: {
    first_name: string;
    last_name?: string;
    full_name?: string;
  };
}

interface MultiScheduleCalendarProps {
  schedules: DoctorSchedule[];
  appointments: Appointment[];
  date: Date;
  onSelectEvent: (appointment: Appointment) => void;
  onSelectSlot: (slotInfo: { start: Date; end: Date; scheduleId?: string }) => void;
  startHour?: number;
  endHour?: number;
}

const HOUR_HEIGHT = 60; // px per hour
const SLOT_MINUTES = 30;

function getClientName(clients?: Appointment["clients"]): string {
  if (!clients) return "";
  if (clients.full_name?.trim()) return clients.full_name.trim();
  return `${clients.first_name || ""} ${clients.last_name || ""}`.trim();
}

function getStatusColor(status: string): string {
  switch (status) {
    case "confirmed": return "#3b82f6";
    case "completed": return "#22c55e";
    case "cancelled": return "#ef4444";
    case "no_show": return "#6b7280";
    default: return "#6366f1";
  }
}

export function MultiScheduleCalendar({
  schedules,
  appointments,
  date,
  onSelectEvent,
  onSelectSlot,
  startHour = 7,
  endHour = 20,
}: MultiScheduleCalendarProps) {
  const activeSchedules = schedules.filter(s => s.isActive);
  const hours = useMemo(() => {
    const h: number[] = [];
    for (let i = startHour; i <= endHour; i++) h.push(i);
    return h;
  }, [startHour, endHour]);

  const totalHeight = (endHour - startHour) * HOUR_HEIGHT;

  // Group appointments by schedule
  const appointmentsBySchedule = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    for (const s of activeSchedules) {
      map[s.id] = [];
    }
    // Also have an "unassigned" bucket
    map["_unassigned"] = [];

    for (const appt of appointments) {
      if (appt.status === "cancelled") continue;

      const apptDate = new Date(appt.scheduled_for);
      if (apptDate.toDateString() !== date.toDateString()) continue;

      const scheduleId = appt.schedule_id || appt.schedule?.id;
      if (scheduleId && map[scheduleId]) {
        map[scheduleId].push(appt);
      } else {
        // Try matching by assigned_to → schedule.userId
        const matchedSchedule = activeSchedules.find(s => s.userId === appt.assigned_to);
        if (matchedSchedule) {
          map[matchedSchedule.id].push(appt);
        } else {
          map["_unassigned"].push(appt);
        }
      }
    }
    return map;
  }, [appointments, activeSchedules, date]);

  const getApptPosition = (appt: Appointment) => {
    const start = new Date(appt.scheduled_for);
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const baseMinutes = startHour * 60;
    const top = ((startMinutes - baseMinutes) / 60) * HOUR_HEIGHT;
    const height = Math.max((appt.duration_minutes / 60) * HOUR_HEIGHT, 24);
    return { top, height };
  };

  const handleColumnClick = (scheduleId: string, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minutes = Math.floor(y / HOUR_HEIGHT * 60) + startHour * 60;
    const roundedMinutes = Math.floor(minutes / SLOT_MINUTES) * SLOT_MINUTES;
    const hour = Math.floor(roundedMinutes / 60);
    const minute = roundedMinutes % 60;

    const start = new Date(date);
    start.setHours(hour, minute, 0, 0);
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    onSelectSlot({ start, end, scheduleId: scheduleId === "_unassigned" ? undefined : scheduleId });
  };

  if (activeSchedules.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground border rounded-xl bg-card">
        <p>Nenhuma agenda ativa encontrada.</p>
        <p className="text-sm mt-1">Crie agendas para profissionais em Configuracoes.</p>
      </div>
    );
  }

  const columns = [
    ...activeSchedules.map(s => ({ id: s.id, name: s.name, color: s.color })),
    ...(appointmentsBySchedule["_unassigned"]?.length > 0
      ? [{ id: "_unassigned", name: "Sem agenda", color: "#9ca3af" }]
      : []),
  ];

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex border-b sticky top-0 z-10 bg-card">
        {/* Time gutter */}
        <div className="w-16 shrink-0 border-r bg-muted/30" />
        {/* Column headers */}
        {columns.map(col => (
          <div
            key={col.id}
            className="flex-1 min-w-[180px] px-3 py-3 text-center border-r last:border-r-0"
          >
            <div className="flex items-center justify-center gap-2">
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: col.color }}
              />
              <span className="font-medium text-sm truncate">{col.name}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Body */}
      <div className="flex overflow-x-auto">
        {/* Time gutter */}
        <div className="w-16 shrink-0 border-r relative" style={{ height: totalHeight }}>
          {hours.map(h => (
            <div
              key={h}
              className="absolute w-full text-right pr-2 text-xs text-muted-foreground"
              style={{ top: (h - startHour) * HOUR_HEIGHT - 8 }}
            >
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {/* Columns */}
        {columns.map(col => (
          <div
            key={col.id}
            className="flex-1 min-w-[180px] relative border-r last:border-r-0 cursor-pointer"
            style={{ height: totalHeight }}
            onClick={(e) => handleColumnClick(col.id, e)}
          >
            {/* Hour lines */}
            {hours.map(h => (
              <div
                key={h}
                className="absolute w-full border-t border-border/40"
                style={{ top: (h - startHour) * HOUR_HEIGHT }}
              />
            ))}
            {/* Half-hour lines */}
            {hours.map(h => (
              <div
                key={`${h}-half`}
                className="absolute w-full border-t border-border/20 border-dashed"
                style={{ top: (h - startHour) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
              />
            ))}

            {/* Appointments */}
            {(appointmentsBySchedule[col.id] || []).map(appt => {
              const { top, height } = getApptPosition(appt);
              const clientName = getClientName(appt.clients);
              const scheduleColor = col.id !== "_unassigned" ? col.color : getStatusColor(appt.status);
              const timeStr = format(new Date(appt.scheduled_for), "HH:mm");

              return (
                <div
                  key={appt.id}
                  className="absolute left-1 right-1 rounded-md px-2 py-1 text-white text-xs cursor-pointer hover:opacity-90 transition-opacity overflow-hidden z-10"
                  style={{
                    top,
                    height,
                    backgroundColor: scheduleColor,
                    minHeight: 24,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEvent(appt);
                  }}
                  title={`${timeStr} - ${appt.title}${clientName ? ` (${clientName})` : ""}`}
                >
                  <div className="font-medium truncate leading-tight">
                    {timeStr} - {appt.title}
                  </div>
                  {height > 36 && clientName && (
                    <div className="truncate opacity-80 leading-tight">{clientName}</div>
                  )}
                </div>
              );
            })}

            {/* Current time indicator */}
            {date.toDateString() === new Date().toDateString() && (() => {
              const now = new Date();
              const nowMinutes = now.getHours() * 60 + now.getMinutes();
              const baseMinutes = startHour * 60;
              const top = ((nowMinutes - baseMinutes) / 60) * HOUR_HEIGHT;
              if (top < 0 || top > totalHeight) return null;
              return (
                <div
                  className="absolute left-0 right-0 h-0.5 bg-destructive z-20 pointer-events-none"
                  style={{ top }}
                >
                  <div className="w-2 h-2 rounded-full bg-destructive -translate-y-[3px] -translate-x-1" />
                </div>
              );
            })()}
          </div>
        ))}
      </div>
    </div>
  );
}

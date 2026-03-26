import { useMemo } from 'react';
import { Calendar, dateFnsLocalizer, Event, View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import './calendar-styles.css';

const locales = { 'pt-BR': ptBR };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

interface Appointment {
  id: string;
  title: string;
  scheduled_for: string;
  duration_minutes: number;
  status: string;
  clients?: {
    first_name: string;
    last_name?: string;
    full_name?: string;
  };
}

const getClientName = (clients?: Appointment['clients']): string => {
  if (!clients) return '';
  if (clients.full_name?.trim()) return clients.full_name.trim();
  const name = `${clients.first_name || ''} ${clients.last_name || ''}`.trim();
  return name;
};

interface AppointmentCalendarProps {
  appointments: Appointment[];
  onSelectSlot: (slotInfo: { start: Date; end: Date }) => void;
  onSelectEvent: (appointment: Appointment) => void;
  date?: Date;
  view?: View;
  onNavigate?: (date: Date) => void;
  onView?: (view: View) => void;
  searchQuery?: string;
}

export function AppointmentCalendar({ 
  appointments, 
  onSelectSlot, 
  onSelectEvent,
  date,
  view = 'month',
  onNavigate,
  onView,
  searchQuery = '',
}: AppointmentCalendarProps) {
  const filteredAppointments = useMemo(() => {
    if (!searchQuery) return appointments;
    const q = searchQuery.toLowerCase();
    return appointments.filter(a => {
      const clientName = getClientName(a.clients);
      return a.title.toLowerCase().includes(q) || clientName.toLowerCase().includes(q);
    });
  }, [appointments, searchQuery]);

  const events: Event[] = filteredAppointments.map((appointment) => {
    const start = new Date(appointment.scheduled_for);
    const end = new Date(start.getTime() + appointment.duration_minutes * 60000);
    
    const clientName = getClientName(appointment.clients);
    
    const timeStr = start.toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
    
    const displayTitle = clientName 
      ? `${timeStr} - ${appointment.title}`
      : `${timeStr} - ${appointment.title}`;
    
    return {
      title: displayTitle,
      start,
      end,
      resource: appointment,
    };
  });

  const eventStyleGetter = (event: Event) => {
    const appointment = event.resource as Appointment;
    let backgroundColor = '#6366f1'; // indigo-500 (scheduled)
    
    switch (appointment.status) {
      case 'confirmed':
        backgroundColor = '#3b82f6'; // blue-500
        break;
      case 'completed':
        backgroundColor = '#22c55e'; // green-500
        break;
      case 'cancelled':
        backgroundColor = '#ef4444'; // red-500
        break;
      case 'no_show':
        backgroundColor = '#6b7280'; // gray-500
        break;
      case 'scheduled':
      default:
        backgroundColor = '#6366f1'; // indigo-500
    }

    return {
      style: {
        backgroundColor,
        borderRadius: '6px',
        opacity: 0.95,
        color: 'white',
        border: 'none',
        display: 'block',
        fontSize: '11px',
        fontWeight: 500,
        padding: '2px 8px',
        lineHeight: '1.5',
      },
    };
  };

  return (
    <div className="calendar-container rounded-xl border bg-card overflow-hidden">
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        style={{ height: 650 }}
        date={date}
        view={view}
        onNavigate={onNavigate}
        onView={onView}
        onSelectSlot={onSelectSlot}
        onSelectEvent={(event) => onSelectEvent(event.resource as Appointment)}
        selectable
        toolbar={false}
        eventPropGetter={eventStyleGetter}
        messages={{
          next: 'Próximo',
          previous: 'Anterior',
          today: 'Hoje',
          month: 'Mês',
          week: 'Semana',
          day: 'Dia',
          agenda: 'Agenda',
          date: 'Data',
          time: 'Hora',
          event: 'Agendamento',
          noEventsInRange: 'Nenhum agendamento neste período',
          showMore: (total) => `+ ${total} mais`,
        }}
      />
    </div>
  );
}

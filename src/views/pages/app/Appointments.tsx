import { useState } from 'react';
import { useAppointments } from '@/hooks/useAppointments';
import { useClients } from '@/hooks/useClients';
import { useTeam } from '@/hooks/useTeam';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';
import { invokeFn } from '@/lib/api-functions';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Calendar as CalendarIcon, Pencil, Trash2, CheckCircle, List, ArrowLeft, MessageCircle, Search, ChevronLeft, ChevronRight, UserCog } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ClientCombobox } from '@/components/appointments/ClientCombobox';
import { AppointmentCalendar } from '@/components/appointments/AppointmentCalendar';
import { AvailableSlotsPicker } from '@/components/appointments/AvailableSlotsPicker';

const PAGE_SIZE = 25;

const statusMap = {
  scheduled: { label: 'Agendado', variant: 'default' as const },
  confirmed: { label: 'Confirmado', variant: 'default' as const },
  completed: { label: 'Realizado', variant: 'default' as const },
  cancelled: { label: 'Cancelado', variant: 'destructive' as const },
  no_show: { label: 'Falta', variant: 'secondary' as const },
};

const getClientName = (appointment: any): string => {
  if (!appointment.clients) return '-';
  const { first_name, last_name, full_name } = appointment.clients;
  if (full_name?.trim()) return full_name.trim();
  const name = `${first_name || ''} ${last_name || ''}`.trim();
  return name || '-';
};

export default function Appointments() {
  const { appointments, loading, createAppointment, updateAppointment, deleteAppointment } = useAppointments();
  const { clients } = useClients();
  const { teamMembers } = useTeam();
  const { effectiveCompanyId } = useEffectiveCompanyId();
  const router = useRouter();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('calendar');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [listPage, setListPage] = useState(1);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'day'>('month');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    client_id: '',
    assigned_to: '',
    scheduled_for: '',
    duration_minutes: 60,
    location: '',
    notes: '',
  });

  const filteredAppointments = appointments.filter((a: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return a.title?.toLowerCase().includes(q) || getClientName(a).toLowerCase().includes(q);
  });
  const listTotalPages = Math.max(1, Math.ceil(filteredAppointments.length / PAGE_SIZE));
  const safeListPage = Math.min(listPage, listTotalPages);
  const paginatedAppointments = filteredAppointments.slice((safeListPage - 1) * PAGE_SIZE, safeListPage * PAGE_SIZE);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!effectiveCompanyId) {
      toast({ title: 'Erro', description: 'Empresa não identificada. Faça login novamente.', variant: 'destructive' });
      return;
    }

    if (!formData.scheduled_for) {
      toast({ title: 'Erro', description: 'Selecione um horário para o agendamento.', variant: 'destructive' });
      return;
    }

    const scheduledDate = new Date(formData.scheduled_for);
    if (isNaN(scheduledDate.getTime())) {
      toast({ title: 'Erro', description: 'Data/horário inválido. Selecione novamente.', variant: 'destructive' });
      return;
    }
    
    try {
      if (editingAppointment) {
        const { data, error } = await invokeFn('reschedule-appointment', {
            appointment_id: editingAppointment.id,
            new_scheduled_for: scheduledDate.toISOString(),
            new_duration_minutes: formData.duration_minutes,
          });

        if (error || !data?.success) {
          if (error?.includes('401') || error?.includes('Unauthorized')) {
            toast({ title: 'Sessão expirada', description: 'Faça login novamente para continuar.', variant: 'destructive' });
            return;
          }
          toast({ title: 'Erro ao remarcar', description: data?.message || error || 'Erro desconhecido', variant: 'destructive' });
          return;
        }
      } else {
        const { assigned_to, ...restFormData } = formData;
        const { data, error } = await invokeFn('create-appointment', {
            company_id: effectiveCompanyId,
            ...restFormData,
            ...(assigned_to ? { assigned_to } : {}),
            scheduled_for: scheduledDate.toISOString(),
          });

        if (error?.includes('401') || error?.includes('Unauthorized')) {
          toast({ title: 'Sessão expirada', description: 'Faça login novamente para continuar.', variant: 'destructive' });
          return;
        }

        if (error || !data?.success) {
          let errorMessage = data?.message || data?.error || error || 'Erro desconhecido';
          if (data?.conflicting_appointment?.client_name) {
            errorMessage += ` (Cliente: ${data.conflicting_appointment.client_name})`;
          }
          toast({ title: 'Erro ao criar agendamento', description: errorMessage, variant: 'destructive' });
          return;
        }
      }

      toast({ title: editingAppointment ? 'Agendamento atualizado!' : 'Agendamento criado!' });
      setIsDialogOpen(false);
      resetForm();
      window.location.reload();
    } catch (error: any) {
      console.error('Error submitting appointment:', error);
      if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        toast({ title: 'Sessão expirada', description: 'Faça login novamente para continuar.', variant: 'destructive' });
        return;
      }
      toast({ title: 'Erro', description: error.message || 'Erro ao processar agendamento', variant: 'destructive' });
    }
  };

  const resetForm = () => {
    setFormData({ title: '', description: '', client_id: '', assigned_to: '', scheduled_for: '', duration_minutes: 60, location: '', notes: '' });
    setEditingAppointment(null);
    setSelectedDate(undefined);
  };

  const handleEdit = (appointment: any) => {
    setEditingAppointment(appointment);
    const appointmentDate = appointment.scheduled_for ? new Date(appointment.scheduled_for) : undefined;
    setSelectedDate(appointmentDate);
    setFormData({
      title: appointment.title || '',
      description: appointment.description || '',
      client_id: appointment.client_id || '',
      assigned_to: appointment.assigned_to || '',
      scheduled_for: appointment.scheduled_for ? format(appointmentDate!, "yyyy-MM-dd'T'HH:mm") : '',
      duration_minutes: appointment.duration_minutes || 60,
      location: appointment.location || '',
      notes: appointment.notes || '',
    });
    setIsDialogOpen(true);
  };

  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null; hasGoogleEvent: boolean }>({ open: false, id: null, hasGoogleEvent: false });
  const [deleteFromGoogle, setDeleteFromGoogle] = useState(true);

  const handleDeleteClick = (id: string) => {
    const appointment = appointments.find(a => a.id === id);
    const hasGoogleEvent = !!appointment?.google_event_id;
    setDeleteFromGoogle(hasGoogleEvent);
    setDeleteConfirm({ open: true, id, hasGoogleEvent });
  };

  const handleDeleteConfirm = async () => {
    if (deleteConfirm.id) {
      const deleted = await deleteAppointment(deleteConfirm.id, deleteFromGoogle);
      setDeleteConfirm({ open: false, id: null, hasGoogleEvent: false });

      if (deleted) {
        setIsDialogOpen(false);
        resetForm();
      }
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    await updateAppointment(id, { status: status as any });
  };

  const handleSelectSlot = (slotInfo: { start: Date; end: Date }) => {
    setSelectedDate(slotInfo.start);
    setIsDialogOpen(true);
  };

  const handleSlotSelected = (slotStart: string) => {
    const scheduledFor = format(new Date(slotStart), "yyyy-MM-dd'T'HH:mm");
    setFormData({ ...formData, scheduled_for: scheduledFor });
  };

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    setFormData({ ...formData, scheduled_for: '' });
  };

  const handleSelectEvent = (appointment: any) => {
    handleEdit(appointment);
  };

  const handleNavigateToday = () => setCalendarDate(new Date());
  const handleNavigatePrev = () => setCalendarDate(prev => subMonths(prev, 1));
  const handleNavigateNext = () => setCalendarDate(prev => addMonths(prev, 1));

  const currentMonthLabel = format(calendarDate, "MMMM 'de' yyyy", { locale: ptBR });
  const capitalizedMonth = currentMonthLabel.charAt(0).toUpperCase() + currentMonthLabel.slice(1);

  // Subtitle with month name
  const subtitleMonth = format(calendarDate, "MMMM", { locale: ptBR });
  const capitalizedSubtitleMonth = subtitleMonth.charAt(0).toUpperCase() + subtitleMonth.slice(1);

  return (
    <div className="space-y-6">
      {/* Top bar: Tabs + Search + New Button */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="calendar">
              <CalendarIcon className="h-4 w-4 mr-2" />
              Calendário
            </TabsTrigger>
            <TabsTrigger value="list">
              <List className="h-4 w-4 mr-2" />
              Lista
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-3 flex-1 max-w-lg justify-end">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setListPage(1); }}
              className="pl-9"
            />
          </div>

          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="whitespace-nowrap">
                <Plus className="h-4 w-4 mr-2" />
                Novo Agendamento
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>
                    {editingAppointment ? 'Editar Agendamento' : 'Novo Agendamento'}
                  </DialogTitle>
                  <DialogDescription>
                    Preencha os dados do agendamento
                  </DialogDescription>
                  {editingAppointment && (
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {editingAppointment.status && (
                        <Badge variant={statusMap[editingAppointment.status as keyof typeof statusMap]?.variant || 'default'} className="w-fit">
                          {statusMap[editingAppointment.status as keyof typeof statusMap]?.label || editingAppointment.status}
                        </Badge>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={async () => {
                          const clientId = editingAppointment.client_id;
                          if (!clientId) return;
                          try {
                            const res = await fetch(`/api/conversations/find-by-client?clientId=${clientId}`);
                            const data = await res.json();
                            if (data?.id) {
                              setIsDialogOpen(false);
                              router.push(`/app/conversations?conversation=${data.id}`);
                            } else {
                              toast({ title: 'Nenhuma conversa encontrada para este cliente', variant: 'destructive' });
                            }
                          } catch {
                            toast({ title: 'Erro ao buscar conversa', variant: 'destructive' });
                          }
                        }}
                      >
                        <MessageCircle className="h-4 w-4" />
                        Abrir Conversa
                      </Button>
                    </div>
                  )}
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="title">Título *</Label>
                    <Input id="title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="client_id">Cliente *</Label>
                    <ClientCombobox clients={clients} value={formData.client_id} onChange={(value) => setFormData({ ...formData, client_id: value })} placeholder="Buscar cliente..." />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="assigned_to">Profissional</Label>
                    <Select
                      value={formData.assigned_to || '_none'}
                      onValueChange={(value) => setFormData({ ...formData, assigned_to: value === '_none' ? '' : value, scheduled_for: '' })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Qualquer profissional" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Qualquer profissional</SelectItem>
                        {(teamMembers || []).map((member: any) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.full_name || member.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Selecione o profissional responsável pelo atendimento</p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="duration_minutes">Duração (min)</Label>
                    <Input
                      id="duration_minutes"
                      type="number"
                      value={formData.duration_minutes}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        setFormData({ ...formData, duration_minutes: isNaN(value) || value < 15 ? 60 : value });
                      }}
                      min="15"
                      step="15"
                      className="w-32"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label>Data *</Label>
                    {selectedDate ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => handleDateSelect(undefined)}>
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Alterar Data
                          </Button>
                          <span className="text-sm font-medium">
                            {format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                          </span>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm text-muted-foreground">Selecione o horário:</Label>
                          <AvailableSlotsPicker
                            date={selectedDate}
                            durationMinutes={formData.duration_minutes}
                            assignedTo={formData.assigned_to || undefined}
                            onSelectSlot={handleSlotSelected}
                            selectedSlot={formData.scheduled_for ? new Date(formData.scheduled_for).toISOString() : undefined}
                          />
                        </div>
                        {formData.scheduled_for && (
                          <p className={`text-sm font-medium ${editingAppointment?.status === 'cancelled' ? 'text-destructive' : 'text-primary'}`}>
                            {editingAppointment?.status === 'cancelled'
                              ? `✗ Cancelado (era: ${format(new Date(formData.scheduled_for), "dd/MM/yyyy 'às' HH:mm")})`
                              : `✓ Agendado para: ${format(new Date(formData.scheduled_for), "dd/MM/yyyy 'às' HH:mm")}`
                            }
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="flex justify-center w-full">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={handleDateSelect}
                          locale={ptBR}
                          disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                          className="rounded-md border pointer-events-auto"
                        />
                      </div>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="location">Local/URL</Label>
                    <Input id="location" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} placeholder="Ex: Sala 3 ou https://meet.google.com/..." />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description">Descrição</Label>
                    <Textarea id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="notes">Observações</Label>
                    <Textarea id="notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
                  </div>
                </div>
                <DialogFooter className="gap-2 sm:justify-between">
                  {editingAppointment && (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => handleDeleteClick(editingAppointment.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Excluir agendamento
                    </Button>
                  )}
                  <Button type="submit">
                    {editingAppointment ? 'Salvar' : 'Criar'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Header: Title + Navigation + View Switcher */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agenda</h1>
          <p className="text-muted-foreground">
            Gerencie seus agendamentos para o mês de {capitalizedSubtitleMonth}.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Navigation */}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={handleNavigatePrev} className="h-9 w-9">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleNavigateToday} className="px-4">
              Hoje
            </Button>
            <Button variant="outline" size="icon" onClick={handleNavigateNext} className="h-9 w-9">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* View Switcher */}
          <div className="flex items-center rounded-lg border bg-muted p-0.5">
            <button
              onClick={() => setCalendarView('month')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${calendarView === 'month' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Mês
            </button>
            <button
              onClick={() => setCalendarView('week')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${calendarView === 'week' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Semana
            </button>
            <button
              onClick={() => setCalendarView('day')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${calendarView === 'day' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Dia
            </button>
          </div>
        </div>
      </div>

      {/* Month label */}
      {activeTab === 'calendar' && (
        <div className="text-center">
          <h2 className="text-xl font-semibold">{capitalizedMonth}</h2>
        </div>
      )}

      {/* Calendar View */}
      {activeTab === 'calendar' && (
        <>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : (
            <AppointmentCalendar
              appointments={appointments}
              onSelectSlot={handleSelectSlot}
              onSelectEvent={handleSelectEvent}
              date={calendarDate}
              view={calendarView}
              onNavigate={setCalendarDate}
              onView={(view) => setCalendarView(view as 'month' | 'week' | 'day')}
              searchQuery={searchQuery}
            />
          )}
        </>
      )}

      {/* List View */}
      {activeTab === 'list' && (
        <>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Profissional</TableHead>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Duração</TableHead>
                <TableHead>Local</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">Carregando...</TableCell>
                </TableRow>
              ) : filteredAppointments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">Nenhum agendamento encontrado</TableCell>
                </TableRow>
              ) : (
                paginatedAppointments.map((appointment: any) => (
                    <TableRow key={appointment.id}>
                      <TableCell className="font-medium">{appointment.title}</TableCell>
                      <TableCell>{getClientName(appointment)}</TableCell>
                      <TableCell>
                        {appointment.assigned_to
                          ? (teamMembers || []).find((m: any) => m.id === appointment.assigned_to)?.full_name || '-'
                          : '-'}
                      </TableCell>
                      <TableCell>{format(new Date(appointment.scheduled_for), 'dd/MM/yyyy HH:mm')}</TableCell>
                      <TableCell>{appointment.duration_minutes}min</TableCell>
                      <TableCell>{appointment.location || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={statusMap[appointment.status as keyof typeof statusMap]?.variant || 'default'}>
                          {statusMap[appointment.status as keyof typeof statusMap]?.label || appointment.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {appointment.status === 'scheduled' && (
                            <Button variant="ghost" size="icon" onClick={() => handleStatusChange(appointment.id, 'completed')} title="Marcar como realizado">
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(appointment)} aria-label="Editar agendamento">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(appointment.id)} aria-label="Excluir agendamento">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
              )}
            </TableBody>
          </Table>
        </div>

        {listTotalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm text-muted-foreground">
              {filteredAppointments.length} agendamento(s) — Página {safeListPage} de {listTotalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={safeListPage <= 1} onClick={() => setListPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={safeListPage >= listTotalPages} onClick={() => setListPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        </>
      )}

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ open, id: open ? deleteConfirm.id : null, hasGoogleEvent: deleteConfirm.hasGoogleEvent })}
        title="Excluir Agendamento"
        description={
          deleteConfirm.hasGoogleEvent
            ? "Tem certeza que deseja excluir este agendamento? O evento também será removido do Google Calendar."
            : "Tem certeza que deseja excluir este agendamento? Esta ação não pode ser desfeita."
        }
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
      >
        {deleteConfirm.hasGoogleEvent && (
          <div className="flex items-center gap-2 mt-2 p-3 rounded-md border bg-muted/50">
            <input
              type="checkbox"
              id="delete-google"
              checked={deleteFromGoogle}
              onChange={(e) => setDeleteFromGoogle(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <label htmlFor="delete-google" className="text-sm text-muted-foreground cursor-pointer">
              Também remover do Google Calendar
            </label>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}

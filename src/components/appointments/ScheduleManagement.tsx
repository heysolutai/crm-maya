"use client";

import { useState } from "react";
import { useSchedules, DoctorSchedule } from "@/hooks/useSchedules";
import { useTeam } from "@/hooks/useTeam";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Plus, Pencil, Trash2, Calendar, Clock, Save, UserCog } from "lucide-react";
import { toast } from "sonner";

interface BusinessHours {
  enabled: boolean;
  start: string;
  end: string;
}

const DEFAULT_BUSINESS_HOURS: Record<string, BusinessHours> = {
  monday: { enabled: true, start: "08:00", end: "18:00" },
  tuesday: { enabled: true, start: "08:00", end: "18:00" },
  wednesday: { enabled: true, start: "08:00", end: "18:00" },
  thursday: { enabled: true, start: "08:00", end: "18:00" },
  friday: { enabled: true, start: "08:00", end: "18:00" },
  saturday: { enabled: false, start: "08:00", end: "12:00" },
  sunday: { enabled: false, start: "08:00", end: "12:00" },
};

const DAY_LABELS: Record<string, string> = {
  monday: "Segunda-feira",
  tuesday: "Terca-feira",
  wednesday: "Quarta-feira",
  thursday: "Quinta-feira",
  friday: "Sexta-feira",
  saturday: "Sabado",
  sunday: "Domingo",
};

const COLORS = [
  "#6366f1", "#3b82f6", "#22c55e", "#ef4444", "#f59e0b",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#06b6d4",
];

const DEFAULT_APPT_SETTINGS = {
  default_duration_minutes: 30,
  slot_interval_minutes: 30,
  buffer_between_appointments_minutes: 0,
  min_notice_hours: 1,
  advance_booking_days: 30,
};

export function ScheduleManagement() {
  const { schedules, loading, createSchedule, updateSchedule, deleteSchedule } = useSchedules();
  const { teamMembers } = useTeam();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<DoctorSchedule | null>(null);
  const [formData, setFormData] = useState({
    userId: "",
    name: "",
    color: "#6366f1",
    businessHours: { ...DEFAULT_BUSINESS_HOURS },
    appointmentSettings: { ...DEFAULT_APPT_SETTINGS },
  });

  const usersWithSchedule = new Set(schedules.map(s => s.userId));
  const availableMembers = (teamMembers || []).filter((m: { id: string }) => !usersWithSchedule.has(m.id));

  const openCreate = () => {
    setEditingSchedule(null);
    setFormData({
      userId: "",
      name: "",
      color: COLORS[schedules.length % COLORS.length],
      businessHours: { ...DEFAULT_BUSINESS_HOURS },
      appointmentSettings: { ...DEFAULT_APPT_SETTINGS },
    });
    setDialogOpen(true);
  };

  const openEdit = (schedule: DoctorSchedule) => {
    setEditingSchedule(schedule);
    const bh = (schedule.businessHours && typeof schedule.businessHours === "object" && Object.keys(schedule.businessHours).length > 0)
      ? schedule.businessHours as Record<string, BusinessHours>
      : { ...DEFAULT_BUSINESS_HOURS };
    const as_ = (schedule.appointmentSettings && typeof schedule.appointmentSettings === "object" && Object.keys(schedule.appointmentSettings).length > 0)
      ? schedule.appointmentSettings as Record<string, number>
      : { ...DEFAULT_APPT_SETTINGS };
    setFormData({
      userId: schedule.userId,
      name: schedule.name,
      color: schedule.color,
      businessHours: bh,
      appointmentSettings: { ...DEFAULT_APPT_SETTINGS, ...as_ },
    });
    setDialogOpen(true);
  };

  const handleDayChange = (day: string, field: keyof BusinessHours, value: boolean | string) => {
    setFormData(prev => ({
      ...prev,
      businessHours: {
        ...prev.businessHours,
        [day]: { ...prev.businessHours[day], [field]: value },
      },
    }));
  };

  const handleApptSettingChange = (field: string, value: number) => {
    setFormData(prev => ({
      ...prev,
      appointmentSettings: { ...prev.appointmentSettings, [field]: value },
    }));
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Nome da agenda e obrigatorio");
      return;
    }

    if (editingSchedule) {
      updateSchedule.mutate({
        id: editingSchedule.id,
        name: formData.name,
        color: formData.color,
        businessHours: formData.businessHours,
        appointmentSettings: formData.appointmentSettings,
      });
    } else {
      if (!formData.userId) {
        toast.error("Selecione um profissional");
        return;
      }
      createSchedule.mutate({
        userId: formData.userId,
        name: formData.name,
        color: formData.color,
        businessHours: formData.businessHours,
        appointmentSettings: formData.appointmentSettings,
      });
    }
    setDialogOpen(false);
  };

  const handleDelete = () => {
    if (editingSchedule) {
      deleteSchedule.mutate(editingSchedule.id);
      setDeleteDialogOpen(false);
      setDialogOpen(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserCog className="h-5 w-5" />
                Agendas por Profissional
              </CardTitle>
              <CardDescription>
                Cada profissional possui sua propria agenda com horarios e configuracoes independentes
              </CardDescription>
            </div>
            <Button onClick={openCreate} disabled={availableMembers.length === 0}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Agenda
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-center py-8">Carregando...</p>
          ) : schedules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>Nenhuma agenda criada ainda.</p>
              <p className="text-sm">Crie agendas para seus profissionais configurarem horarios individuais.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {schedules.map(schedule => (
                <div
                  key={schedule.id}
                  className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => openEdit(schedule)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{ backgroundColor: schedule.color }}
                    />
                    <div>
                      <div className="font-medium">{schedule.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {schedule.user?.fullName || schedule.user?.email}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {schedule._count?.appointments !== undefined && (
                      <span className="text-xs text-muted-foreground">
                        {schedule._count.appointments} agendamento(s)
                      </span>
                    )}
                    <Badge variant={schedule.isActive ? "default" : "secondary"}>
                      {schedule.isActive ? "Ativa" : "Inativa"}
                    </Badge>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEdit(schedule); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[650px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSchedule ? `Editar Agenda: ${editingSchedule.name}` : "Nova Agenda"}
            </DialogTitle>
            <DialogDescription>
              Configure os horarios e preferencias de agendamento
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Basic info */}
            <div className="grid gap-4 md:grid-cols-2">
              {!editingSchedule && (
                <div className="space-y-2">
                  <Label>Profissional *</Label>
                  <Select value={formData.userId} onValueChange={v => {
                    const member = (teamMembers || []).find((m: { id: string }) => m.id === v) as { id: string; full_name?: string; email: string } | undefined;
                    setFormData(prev => ({
                      ...prev,
                      userId: v,
                      name: prev.name || member?.full_name || member?.email || "",
                    }));
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMembers.map((m: { id: string; full_name?: string; email: string }) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.full_name || m.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Nome da agenda *</Label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Dr. Joao Silva"
                />
              </div>
            </div>

            {/* Color picker */}
            <div className="space-y-2">
              <Label>Cor no calendario</Label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 transition-all ${formData.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setFormData(prev => ({ ...prev, color: c }))}
                  />
                ))}
              </div>
            </div>

            {/* Active toggle */}
            {editingSchedule && (
              <div className="flex items-center justify-between">
                <div>
                  <Label>Agenda ativa</Label>
                  <p className="text-xs text-muted-foreground">Desativar oculta a agenda do calendario</p>
                </div>
                <Switch
                  checked={editingSchedule.isActive}
                  onCheckedChange={checked => {
                    updateSchedule.mutate({ id: editingSchedule.id, isActive: checked });
                  }}
                />
              </div>
            )}

            {/* Business hours */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <Label className="text-base font-medium">Horarios de Atendimento</Label>
              </div>
              <div className="space-y-1">
                {Object.keys(DAY_LABELS).map(day => (
                  <div key={day} className="flex items-center gap-3 py-2 border-b last:border-b-0">
                    <div className="w-28">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={formData.businessHours[day]?.enabled ?? false}
                          onCheckedChange={checked => handleDayChange(day, "enabled", checked)}
                        />
                        <Label className="text-sm">{DAY_LABELS[day]}</Label>
                      </div>
                    </div>
                    <Input
                      type="time"
                      value={formData.businessHours[day]?.start || "08:00"}
                      onChange={e => handleDayChange(day, "start", e.target.value)}
                      disabled={!formData.businessHours[day]?.enabled}
                      className="w-28"
                    />
                    <span className="text-muted-foreground text-sm">ate</span>
                    <Input
                      type="time"
                      value={formData.businessHours[day]?.end || "18:00"}
                      onChange={e => handleDayChange(day, "end", e.target.value)}
                      disabled={!formData.businessHours[day]?.enabled}
                      className="w-28"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Appointment settings */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Configuracoes de Agendamento</Label>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-sm">Duracao padrao (min)</Label>
                  <Input
                    type="number"
                    value={formData.appointmentSettings.default_duration_minutes}
                    onChange={e => handleApptSettingChange("default_duration_minutes", parseInt(e.target.value) || 30)}
                    min={5}
                    max={480}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">Intervalo entre slots (min)</Label>
                  <Input
                    type="number"
                    value={formData.appointmentSettings.slot_interval_minutes}
                    onChange={e => handleApptSettingChange("slot_interval_minutes", parseInt(e.target.value) || 30)}
                    min={5}
                    max={120}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">Buffer entre consultas (min)</Label>
                  <Input
                    type="number"
                    value={formData.appointmentSettings.buffer_between_appointments_minutes}
                    onChange={e => handleApptSettingChange("buffer_between_appointments_minutes", parseInt(e.target.value) || 0)}
                    min={0}
                    max={120}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">Antecedencia minima (horas)</Label>
                  <Input
                    type="number"
                    value={formData.appointmentSettings.min_notice_hours}
                    onChange={e => handleApptSettingChange("min_notice_hours", parseInt(e.target.value) || 0)}
                    min={0}
                    max={72}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">Antecedencia maxima (dias)</Label>
                  <Input
                    type="number"
                    value={formData.appointmentSettings.advance_booking_days}
                    onChange={e => handleApptSettingChange("advance_booking_days", parseInt(e.target.value) || 30)}
                    min={1}
                    max={365}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {editingSchedule && (
              <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </Button>
            )}
            <Button
              onClick={handleSave}
              disabled={createSchedule.isPending || updateSchedule.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {editingSchedule ? "Salvar" : "Criar Agenda"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Excluir Agenda"
        description={`Tem certeza que deseja excluir a agenda "${editingSchedule?.name}"? Os agendamentos existentes serao desvinculados.`}
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </>
  );
}

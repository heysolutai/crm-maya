"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSchedules } from "@/hooks/useSchedules";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Save, Clock, Calendar, Loader2 } from "lucide-react";
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

export default function MySchedule() {
  const { user } = useAuth();
  const { schedules, loading, createSchedule, updateSchedule } = useSchedules();

  const mySchedule = schedules.find(s => s.userId === user?.id);

  const [businessHours, setBusinessHours] = useState<Record<string, BusinessHours>>(DEFAULT_BUSINESS_HOURS);
  const [apptSettings, setApptSettings] = useState(DEFAULT_APPT_SETTINGS);
  const [color, setColor] = useState("#6366f1");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mySchedule) {
      const bh = mySchedule.businessHours as Record<string, BusinessHours> | null;
      if (bh && Object.keys(bh).length > 0) setBusinessHours(bh);
      const as_ = mySchedule.appointmentSettings as Record<string, number> | null;
      if (as_ && Object.keys(as_).length > 0) setApptSettings({ ...DEFAULT_APPT_SETTINGS, ...as_ });
      setColor(mySchedule.color);
    }
  }, [mySchedule]);

  const handleDayChange = (day: string, field: keyof BusinessHours, value: boolean | string) => {
    setBusinessHours(prev => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      if (mySchedule) {
        updateSchedule.mutate({
          id: mySchedule.id,
          color,
          businessHours,
          appointmentSettings: apptSettings,
        });
      } else {
        const name = user.user_metadata?.full_name || user.email;
        createSchedule.mutate({
          userId: user.id,
          name,
          color,
          businessHours,
          appointmentSettings: apptSettings,
        });
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Minha Agenda</h1>
        <p className="text-muted-foreground">
          Configure seus horarios de atendimento e preferencias de agendamento.
        </p>
      </div>

      {/* Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Status da Agenda
              </CardTitle>
              <CardDescription>
                {mySchedule
                  ? "Sua agenda esta configurada e ativa."
                  : "Voce ainda nao configurou sua agenda. Preencha abaixo para ativa-la."}
              </CardDescription>
            </div>
            {mySchedule && (
              <Badge variant={mySchedule.isActive ? "default" : "secondary"}>
                {mySchedule.isActive ? "Ativa" : "Inativa"}
              </Badge>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Color */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cor no calendario</CardTitle>
          <CardDescription>Escolha a cor que identifica sua agenda na visualizacao multi-profissional.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            {COLORS.map(c => (
              <button
                key={c}
                type="button"
                className={`w-9 h-9 rounded-full border-2 transition-all ${color === c ? "border-foreground scale-110 shadow-md" : "border-transparent hover:scale-105"}`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Business Hours */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Horarios de Atendimento
          </CardTitle>
          <CardDescription>
            Defina os dias e horarios em que voce atende.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {Object.keys(DAY_LABELS).map(day => (
            <div key={day} className="flex items-center gap-3 py-2.5 border-b last:border-b-0">
              <div className="w-32">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={businessHours[day]?.enabled ?? false}
                    onCheckedChange={checked => handleDayChange(day, "enabled", checked)}
                  />
                  <Label className="text-sm font-medium">{DAY_LABELS[day]}</Label>
                </div>
              </div>
              <Input
                type="time"
                value={businessHours[day]?.start || "08:00"}
                onChange={e => handleDayChange(day, "start", e.target.value)}
                disabled={!businessHours[day]?.enabled}
                className="w-28"
              />
              <span className="text-muted-foreground text-sm">ate</span>
              <Input
                type="time"
                value={businessHours[day]?.end || "18:00"}
                onChange={e => handleDayChange(day, "end", e.target.value)}
                disabled={!businessHours[day]?.enabled}
                className="w-28"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Appointment Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuracoes de Agendamento</CardTitle>
          <CardDescription>Preferencias para criacao de consultas na sua agenda.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Duracao padrao (min)</Label>
              <Input
                type="number"
                value={apptSettings.default_duration_minutes}
                onChange={e => setApptSettings(prev => ({ ...prev, default_duration_minutes: parseInt(e.target.value) || 30 }))}
                min={5}
                max={480}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Intervalo entre slots (min)</Label>
              <Input
                type="number"
                value={apptSettings.slot_interval_minutes}
                onChange={e => setApptSettings(prev => ({ ...prev, slot_interval_minutes: parseInt(e.target.value) || 30 }))}
                min={5}
                max={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Buffer entre consultas (min)</Label>
              <Input
                type="number"
                value={apptSettings.buffer_between_appointments_minutes}
                onChange={e => setApptSettings(prev => ({ ...prev, buffer_between_appointments_minutes: parseInt(e.target.value) || 0 }))}
                min={0}
                max={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Antecedencia minima (horas)</Label>
              <Input
                type="number"
                value={apptSettings.min_notice_hours}
                onChange={e => setApptSettings(prev => ({ ...prev, min_notice_hours: parseInt(e.target.value) || 0 }))}
                min={0}
                max={72}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Antecedencia maxima (dias)</Label>
              <Input
                type="number"
                value={apptSettings.advance_booking_days}
                onChange={e => setApptSettings(prev => ({ ...prev, advance_booking_days: parseInt(e.target.value) || 30 }))}
                min={1}
                max={365}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || createSchedule.isPending || updateSchedule.isPending}>
          {(saving || createSchedule.isPending || updateSchedule.isPending) && (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          )}
          <Save className="h-4 w-4 mr-2" />
          {mySchedule ? "Salvar Alteracoes" : "Criar Minha Agenda"}
        </Button>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompanyDetails } from "@/hooks/useCompanyDetails";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { toast } from "sonner";
import { Clock, Settings, Save, MapPin, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface BusinessHours {
  enabled: boolean;
  start: string;
  end: string;
  notes?: string;
}

interface BusinessHoursSettings {
  monday: BusinessHours;
  tuesday: BusinessHours;
  wednesday: BusinessHours;
  thursday: BusinessHours;
  friday: BusinessHours;
  saturday: BusinessHours;
  sunday: BusinessHours;
}

interface LocationConfig {
  id: string;
  name: string;
  address: string;
  business_hours: BusinessHoursSettings;
  exam_notes: string;
  exam_hours_enabled?: boolean;
  exam_hours?: BusinessHoursSettings;
}

interface AppointmentSettings {
  default_duration_minutes: number;
  slot_interval_minutes: number;
  min_notice_hours: number;
  min_notice_minutes?: number;
  advance_booking_days: number;
}

const DEFAULT_BUSINESS_HOURS: BusinessHoursSettings = {
  monday: { enabled: true, start: "09:00", end: "18:00" },
  tuesday: { enabled: true, start: "09:00", end: "18:00" },
  wednesday: { enabled: true, start: "09:00", end: "18:00" },
  thursday: { enabled: true, start: "09:00", end: "18:00" },
  friday: { enabled: true, start: "09:00", end: "18:00" },
  saturday: { enabled: false, start: "09:00", end: "13:00" },
  sunday: { enabled: false, start: "09:00", end: "13:00" },
};

const DEFAULT_APPOINTMENT_SETTINGS: AppointmentSettings = {
  default_duration_minutes: 5,
  slot_interval_minutes: 5,
  min_notice_hours: 1,
  advance_booking_days: 30,
};

const DAY_LABELS: Record<keyof BusinessHoursSettings, string> = {
  monday: "Segunda-feira",
  tuesday: "Terça-feira",
  wednesday: "Quarta-feira",
  thursday: "Quinta-feira",
  friday: "Sexta-feira",
  saturday: "Sábado",
  sunday: "Domingo",
};

function createNewLocation(name = "Novo Endereço", address = ""): LocationConfig {
  return {
    id: crypto.randomUUID(),
    name,
    address,
    business_hours: { ...DEFAULT_BUSINESS_HOURS },
    exam_notes: "",
  };
}

interface AppointmentSettingsConfigProps {
  companyId?: string;
  variant?: 'single-card' | 'split-cards';
}

export function AppointmentSettingsConfig({ 
  companyId, 
  variant = 'split-cards' 
}: AppointmentSettingsConfigProps) {
  const companyDetails = useCompanyDetails(companyId || '');
  const companySettings = useCompanySettings();
  
  const company = companyId ? companyDetails.company : companySettings.company;
  const updateCompany = companyId ? companyDetails.updateCompany : companySettings.updateCompany;
  const isUpdating = companyId ? companyDetails.isUpdating : false;

  const [locations, setLocations] = useState<LocationConfig[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [appointmentSettings, setAppointmentSettings] = useState<AppointmentSettings>(DEFAULT_APPOINTMENT_SETTINGS);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    if (company?.settings) {
      const settings = company.settings as Record<string, unknown>;
      
      // Load locations or migrate from legacy business_hours
      if (settings.locations && Array.isArray(settings.locations) && (settings.locations as LocationConfig[]).length > 0) {
        const locs = settings.locations as LocationConfig[];
        setLocations(locs);
        if (!selectedLocationId || !locs.find(l => l.id === selectedLocationId)) {
          setSelectedLocationId(locs[0].id);
        }
      } else {
        // Migration: create default location from existing business_hours
        const legacyHours = (settings.business_hours as BusinessHoursSettings) || DEFAULT_BUSINESS_HOURS;
        const defaultLoc = createNewLocation("Principal", "");
        defaultLoc.business_hours = legacyHours;
        setLocations([defaultLoc]);
        setSelectedLocationId(defaultLoc.id);
      }

      if (settings.appointment_settings) {
        const raw = settings.appointment_settings as Record<string, unknown>;
        setAppointmentSettings({
          default_duration_minutes: (raw.default_duration_minutes as number) || (raw.defaultDuration as number) || 5,
          slot_interval_minutes: (raw.slot_interval_minutes as number) || (raw.slotInterval as number) || 5,
          min_notice_hours: (raw.min_notice_hours as number) ?? (raw.minAdvanceHours as number) ?? 1,
          min_notice_minutes: (raw.min_notice_minutes as number) ?? ((raw.min_notice_hours as number) ?? (raw.minAdvanceHours as number) ?? 1) * 60,
          advance_booking_days: (raw.advance_booking_days as number) || (raw.maxAdvanceDays as number) || 30,
        });
      }
    }
  }, [company]);

  const selectedLocation = locations.find(l => l.id === selectedLocationId);

  const updateLocation = (locationId: string, updates: Partial<LocationConfig>) => {
    setLocations(prev => prev.map(l => l.id === locationId ? { ...l, ...updates } : l));
  };

  const handleDayChange = (day: keyof BusinessHoursSettings, field: keyof BusinessHours, value: boolean | string) => {
    if (!selectedLocation) return;
    const updatedHours = {
      ...selectedLocation.business_hours,
      [day]: {
        ...selectedLocation.business_hours[day],
        [field]: value,
      },
    };
    updateLocation(selectedLocation.id, { business_hours: updatedHours });
  };

  const handleExamDayChange = (day: keyof BusinessHoursSettings, field: keyof BusinessHours, value: boolean | string) => {
    if (!selectedLocation) return;
    const currentExamHours = selectedLocation.exam_hours || { ...DEFAULT_BUSINESS_HOURS };
    const updatedHours = {
      ...currentExamHours,
      [day]: {
        ...currentExamHours[day],
        [field]: value,
      },
    };
    updateLocation(selectedLocation.id, { exam_hours: updatedHours });
  };

  const handleAddLocation = () => {
    const newLoc = createNewLocation();
    setLocations(prev => [...prev, newLoc]);
    setSelectedLocationId(newLoc.id);
  };

  const handleDeleteLocation = () => {
    if (locations.length <= 1) {
      toast.error("É necessário manter pelo menos um endereço.");
      return;
    }
    const remaining = locations.filter(l => l.id !== selectedLocationId);
    setLocations(remaining);
    setSelectedLocationId(remaining[0].id);
    setDeleteDialogOpen(false);
    toast.success("Endereço removido.");
  };

  const handleAppointmentSettingChange = (field: keyof AppointmentSettings, value: number) => {
    setAppointmentSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      const currentSettings = (company?.settings as Record<string, unknown>) || {};

      // Use the first location's business_hours as the legacy fallback
      const primaryHours = locations[0]?.business_hours || DEFAULT_BUSINESS_HOURS;

      const newSettings = {
        ...currentSettings,
        locations,
        business_hours: primaryHours,
        appointment_settings: appointmentSettings,
      };

      await updateCompany({
        settings: JSON.parse(JSON.stringify(newSettings)),
      });

      toast.success("Configurações salvas com sucesso!");
    } catch (error: any) {
      console.error('[AppointmentSettings] Save error:', error);
      toast.error(error.message || "Erro ao salvar configurações");
    }
  };

  const businessHoursContent = selectedLocation ? (
    <>
      {(Object.keys(DAY_LABELS) as Array<keyof BusinessHoursSettings>).map((day) => (
        <div key={day} className="space-y-2 py-3 border-b last:border-b-0">
          <div className="flex items-center gap-4">
            <div className="w-32">
              <div className="flex items-center gap-2">
                <Switch
                  checked={selectedLocation.business_hours[day].enabled}
                  onCheckedChange={(checked) => handleDayChange(day, "enabled", checked)}
                />
                <Label className="text-sm font-medium">{DAY_LABELS[day]}</Label>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-1">
              <Input
                type="time"
                value={selectedLocation.business_hours[day].start}
                onChange={(e) => handleDayChange(day, "start", e.target.value)}
                disabled={!selectedLocation.business_hours[day].enabled}
                className="w-32"
              />
              <span className="text-muted-foreground">até</span>
              <Input
                type="time"
                value={selectedLocation.business_hours[day].end}
                onChange={(e) => handleDayChange(day, "end", e.target.value)}
                disabled={!selectedLocation.business_hours[day].enabled}
                className="w-32"
              />
            </div>
          </div>
          {selectedLocation.business_hours[day].enabled && (
            <div className="ml-[8.5rem]">
              <Textarea
                placeholder="Observações do dia (ex: reunião às 14h, pausa das 12h-13h...)"
                value={selectedLocation.business_hours[day].notes || ""}
                onChange={(e) => handleDayChange(day, "notes", e.target.value)}
                className="text-xs min-h-[2rem] h-8 resize-none"
                rows={1}
              />
            </div>
          )}
        </div>
      ))}
    </>
  ) : null;

  const locationSelector = (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-muted-foreground" />
        <Label className="text-sm font-medium">Endereço</Label>
      </div>
      <div className="flex items-center gap-2">
        <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Selecione o endereço" />
          </SelectTrigger>
          <SelectContent>
            {locations.map(loc => (
              <SelectItem key={loc.id} value={loc.id}>
                📍 {loc.name || "Sem nome"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={handleAddLocation} title="Adicionar endereço">
          <Plus className="h-4 w-4" />
        </Button>
        {locations.length > 1 && (
          <Button variant="outline" size="icon" onClick={() => setDeleteDialogOpen(true)} title="Excluir endereço" className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {selectedLocation && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Nome do local</Label>
            <Input
              placeholder="Ex: Matriz, Filial Centro..."
              value={selectedLocation.name}
              onChange={(e) => updateLocation(selectedLocation.id, { name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Endereço completo</Label>
            <Input
              placeholder="Ex: Av. Brasil, 123 - Centro"
              value={selectedLocation.address}
              onChange={(e) => updateLocation(selectedLocation.id, { address: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );

  const examHoursContent = selectedLocation ? (
    <>
      {(Object.keys(DAY_LABELS) as Array<keyof BusinessHoursSettings>).map((day) => {
        const examHours = selectedLocation.exam_hours || DEFAULT_BUSINESS_HOURS;
        return (
          <div key={day} className="space-y-2 py-3 border-b last:border-b-0">
            <div className="flex items-center gap-4">
              <div className="w-32">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={examHours[day].enabled}
                    onCheckedChange={(checked) => handleExamDayChange(day, "enabled", checked)}
                  />
                  <Label className="text-sm font-medium">{DAY_LABELS[day]}</Label>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-1">
                <Input
                  type="time"
                  value={examHours[day].start}
                  onChange={(e) => handleExamDayChange(day, "start", e.target.value)}
                  disabled={!examHours[day].enabled}
                  className="w-32"
                />
                <span className="text-muted-foreground">até</span>
                <Input
                  type="time"
                  value={examHours[day].end}
                  onChange={(e) => handleExamDayChange(day, "end", e.target.value)}
                  disabled={!examHours[day].enabled}
                  className="w-32"
                />
              </div>
            </div>
          </div>
        );
      })}
    </>
  ) : null;

  const examNotesContent = selectedLocation ? (
    <div className="space-y-4 border-t pt-4">
      <Label className="text-sm font-medium">Observação para exames</Label>
      <Textarea
        placeholder="Informações sobre exames neste endereço (ex: exames somente com agendamento, trazer documento com foto...)"
        value={selectedLocation.exam_notes || ""}
        onChange={(e) => updateLocation(selectedLocation.id, { exam_notes: e.target.value })}
        rows={3}
      />

      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Horário de exames específicos</Label>
            <p className="text-xs text-muted-foreground">Defina horários específicos para realização de exames</p>
          </div>
          <Switch
            checked={selectedLocation.exam_hours_enabled || false}
            onCheckedChange={(checked) => {
              updateLocation(selectedLocation.id, {
                exam_hours_enabled: checked,
                exam_hours: checked && !selectedLocation.exam_hours ? { ...DEFAULT_BUSINESS_HOURS } : selectedLocation.exam_hours,
              });
            }}
          />
        </div>

        {selectedLocation.exam_hours_enabled && (
          <div className="space-y-2 rounded-lg border p-4 bg-muted/30">
            {examHoursContent}
          </div>
        )}
      </div>
    </div>
  ) : null;

  const appointmentSettingsContent = (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label>Duração padrão (minutos)</Label>
        <Input
          type="number"
          value={appointmentSettings.default_duration_minutes}
          onChange={(e) => handleAppointmentSettingChange("default_duration_minutes", parseInt(e.target.value) || 5)}
          min={5}
          max={480}
        />
      </div>
      <div className="space-y-2">
        <Label>Intervalo entre slots (minutos)</Label>
        <Input
          type="number"
          value={appointmentSettings.slot_interval_minutes}
          onChange={(e) => handleAppointmentSettingChange("slot_interval_minutes", parseInt(e.target.value) || 15)}
          min={5}
          max={60}
        />
      </div>
      <div className="space-y-2">
        <Label>Antecedência mínima (minutos)</Label>
        <Select
          value={String(appointmentSettings.min_notice_minutes ?? (appointmentSettings.min_notice_hours * 60))}
          onValueChange={(val) => {
            const mins = parseInt(val);
            setAppointmentSettings(prev => ({
              ...prev,
              min_notice_minutes: mins,
              min_notice_hours: mins / 60,
            }));
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Sem antecedência</SelectItem>
            <SelectItem value="15">15 minutos</SelectItem>
            <SelectItem value="30">30 minutos</SelectItem>
            <SelectItem value="60">1 hora</SelectItem>
            <SelectItem value="120">2 horas</SelectItem>
            <SelectItem value="180">3 horas</SelectItem>
            <SelectItem value="240">4 horas</SelectItem>
            <SelectItem value="360">6 horas</SelectItem>
            <SelectItem value="480">8 horas</SelectItem>
            <SelectItem value="720">12 horas</SelectItem>
            <SelectItem value="1440">24 horas</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Tempo mínimo de antecedência para agendar
        </p>
      </div>
      <div className="space-y-2">
        <Label>Antecedência máxima (dias)</Label>
        <Input
          type="number"
          value={appointmentSettings.advance_booking_days}
          onChange={(e) => handleAppointmentSettingChange("advance_booking_days", parseInt(e.target.value) || 30)}
          min={1}
          max={365}
        />
      </div>
    </div>
  );

  const confirmDeleteDialog = (
    <ConfirmDialog
      open={deleteDialogOpen}
      onOpenChange={setDeleteDialogOpen}
      title="Excluir endereço"
      description={`Tem certeza que deseja excluir "${selectedLocation?.name}"? Esta ação não pode ser desfeita.`}
      onConfirm={handleDeleteLocation}
      confirmLabel="Excluir"
      variant="destructive"
    />
  );

  // Single card variant
  if (variant === 'single-card') {
    return (
      <>
        {confirmDeleteDialog}
        <Card>
          <CardHeader>
            <CardTitle>Horários de Atendimento</CardTitle>
            <CardDescription>
              Configure os horários disponíveis para agendamentos por endereço
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {locationSelector}

            <div className="space-y-4">
              <h3 className="text-sm font-medium">Dias da Semana</h3>
              {businessHoursContent}
            </div>

            {examNotesContent}

            <div className="space-y-4 border-t pt-6">
              <h3 className="text-sm font-medium">Configurações de Agendamento</h3>
              {appointmentSettingsContent}
            </div>

            <Button onClick={handleSave} disabled={isUpdating} className="w-full">
              <Save className="h-4 w-4 mr-2" />
              Salvar Configurações
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }

  // Split cards variant (default)
  return (
    <>
      {confirmDeleteDialog}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Horários de Funcionamento
            </CardTitle>
            <CardDescription>
              Configure os dias e horários disponíveis para cada endereço
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {locationSelector}
            <div className="space-y-4">
              {businessHoursContent}
            </div>
            {examNotesContent}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configurações de Agendamento
            </CardTitle>
            <CardDescription>
              Defina as regras para criação de agendamentos
            </CardDescription>
          </CardHeader>
          <CardContent>
            {appointmentSettingsContent}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isUpdating}>
            <Save className="h-4 w-4 mr-2" />
            Salvar Configurações
          </Button>
        </div>
      </div>
    </>
  );
}

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";

interface ReminderOffset {
  minutes: number;
  label: string;
  enabled: boolean;
}

interface AppointmentSettings {
  reminder_offsets: ReminderOffset[];
  reminder_message_template: string;
}

interface AppointmentRemindersConfigProps {
  companyId: string;
}

const DEFAULT_TEMPLATE = "Olá {nome}! Lembrando do seu agendamento: {titulo} em {data} às {horario}. Local: {local}. Confirma sua presença?";

const PRESET_OFFSETS = [
  { minutes: 15, label: "15 minutos antes" },
  { minutes: 30, label: "30 minutos antes" },
  { minutes: 60, label: "1 hora antes" },
  { minutes: 120, label: "2 horas antes" },
  { minutes: 1440, label: "24 horas antes" },
  { minutes: 2880, label: "48 horas antes" },
];

export function AppointmentRemindersConfig({ companyId }: AppointmentRemindersConfigProps) {
  const [settings, setSettings] = useState<AppointmentSettings>({
    reminder_offsets: [{ minutes: 120, label: "2 horas antes", enabled: true }],
    reminder_message_template: DEFAULT_TEMPLATE,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch(`/api/company-settings?companyId=${companyId}`);
        if (!res.ok) throw new Error('Failed to load');
        const companySettings = await res.json();

        const appointmentSettings = companySettings?.appointment_settings as AppointmentSettings | undefined;
        if (appointmentSettings) {
          setSettings({
            reminder_offsets: appointmentSettings.reminder_offsets || [{ minutes: 120, label: "2 horas antes", enabled: true }],
            reminder_message_template: appointmentSettings.reminder_message_template || DEFAULT_TEMPLATE,
          });
        }
      } catch (error) {
        console.error('Error loading appointment settings:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadSettings();
  }, [companyId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/company-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          settings: { appointment_settings: settings },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro');

      toast.success('Configurações de lembretes salvas!');
    } catch (error) {
      console.error('Error saving appointment settings:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setIsSaving(false);
    }
  };

  const addReminder = () => {
    const usedMinutes = settings.reminder_offsets.map(r => r.minutes);
    const availablePreset = PRESET_OFFSETS.find(p => !usedMinutes.includes(p.minutes));
    
    if (availablePreset) {
      setSettings(prev => ({
        ...prev,
        reminder_offsets: [...prev.reminder_offsets, { ...availablePreset, enabled: true }],
      }));
    } else {
      toast.error('Todos os lembretes padrão já foram adicionados');
    }
  };

  const removeReminder = (index: number) => {
    setSettings(prev => ({
      ...prev,
      reminder_offsets: prev.reminder_offsets.filter((_, i) => i !== index),
    }));
  };

  const updateReminder = (index: number, field: keyof ReminderOffset, value: any) => {
    setSettings(prev => ({
      ...prev,
      reminder_offsets: prev.reminder_offsets.map((r, i) => 
        i === index ? { ...r, [field]: value } : r
      ),
    }));
  };

  const updateReminderMinutes = (index: number, minutes: number) => {
    const preset = PRESET_OFFSETS.find(p => p.minutes === minutes);
    if (preset) {
      setSettings(prev => ({
        ...prev,
        reminder_offsets: prev.reminder_offsets.map((r, i) => 
          i === index ? { ...preset, enabled: r.enabled } : r
        ),
      }));
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Lembretes de Agendamento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Lembretes de Agendamento
        </CardTitle>
        <CardDescription>
          Configure os lembretes automáticos enviados antes de cada agendamento
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Reminder offsets */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">Quando enviar lembretes</Label>
            <Button variant="outline" size="sm" onClick={addReminder}>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar
            </Button>
          </div>
          
          <div className="space-y-3">
            {settings.reminder_offsets.map((reminder, index) => (
              <div key={index} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
                <Switch
                  checked={reminder.enabled}
                  onCheckedChange={(checked) => updateReminder(index, 'enabled', checked)}
                />
                <Select
                  value={reminder.minutes.toString()}
                  onValueChange={(value) => updateReminderMinutes(index, parseInt(value))}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRESET_OFFSETS.map((preset) => (
                      <SelectItem key={preset.minutes} value={preset.minutes.toString()}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeReminder(index)}
                  disabled={settings.reminder_offsets.length <= 1}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Message template */}
        <div className="space-y-2">
          <Label className="text-base font-medium">Mensagem do lembrete</Label>
          <Textarea
            value={settings.reminder_message_template}
            onChange={(e) => setSettings(prev => ({ ...prev, reminder_message_template: e.target.value }))}
            placeholder="Digite a mensagem do lembrete..."
            rows={4}
          />
          <p className="text-sm text-muted-foreground">
            Variáveis disponíveis: <code className="bg-muted px-1 rounded">{'{nome}'}</code>, 
            <code className="bg-muted px-1 rounded ml-1">{'{titulo}'}</code>, 
            <code className="bg-muted px-1 rounded ml-1">{'{data}'}</code>, 
            <code className="bg-muted px-1 rounded ml-1">{'{horario}'}</code>, 
            <code className="bg-muted px-1 rounded ml-1">{'{local}'}</code>, 
            <code className="bg-muted px-1 rounded ml-1">{'{duracao}'}</code>
          </p>
        </div>

        {/* Preview */}
        <div className="space-y-2">
          <Label className="text-base font-medium">Prévia da mensagem</Label>
          <div className="p-3 border rounded-lg bg-muted/50 text-sm">
            {settings.reminder_message_template
              .replace('{nome}', 'João')
              .replace('{titulo}', 'Consulta')
              .replace('{data}', '25/12/2024')
              .replace('{horario}', '14:00')
              .replace('{local}', 'Clínica Centro')
              .replace('{duracao}', '60 minutos')}
          </div>
        </div>

        <Button onClick={handleSave} disabled={isSaving} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? 'Salvando...' : 'Salvar Configurações'}
        </Button>
      </CardContent>
    </Card>
  );
}
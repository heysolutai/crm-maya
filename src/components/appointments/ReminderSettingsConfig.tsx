import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Bell, Clock, X, Save, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';

interface ReminderOffset {
  minutes: number;
  label: string;
  enabled: boolean;
}

interface ReminderDeliveryHours {
  enabled: boolean;
  start: string;
  end: string;
}

interface AppointmentSettings {
  reminder_offsets: ReminderOffset[];
  reminder_message_template: string;
  reminder_delivery_hours: ReminderDeliveryHours;
}

const DEFAULT_OFFSETS: ReminderOffset[] = [
  { minutes: 120, label: '2 horas antes', enabled: true },
  { minutes: 1440, label: '24 horas antes', enabled: true },
];

const DEFAULT_TEMPLATE = 'Olá {nome}! Lembrando do seu agendamento: {titulo} em {data} às {horario}. Local: {local}. Confirma sua presença?';

const AVAILABLE_OFFSETS = [
  { minutes: 15, label: '15 minutos antes' },
  { minutes: 30, label: '30 minutos antes' },
  { minutes: 60, label: '1 hora antes' },
  { minutes: 120, label: '2 horas antes' },
  { minutes: 180, label: '3 horas antes' },
  { minutes: 360, label: '6 horas antes' },
  { minutes: 720, label: '12 horas antes' },
  { minutes: 1440, label: '24 horas antes' },
  { minutes: 2880, label: '48 horas antes' },
];

export function ReminderSettingsConfig() {
  const { toast } = useToast();
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [offsets, setOffsets] = useState<ReminderOffset[]>(DEFAULT_OFFSETS);
  const [messageTemplate, setMessageTemplate] = useState(DEFAULT_TEMPLATE);
  const [deliveryHours, setDeliveryHours] = useState<ReminderDeliveryHours>({
    enabled: false,
    start: '08:00',
    end: '21:00',
  });

  useEffect(() => {
    const loadSettings = async () => {
      if (!companyId) return;

      try {
        const res = await fetch(`/api/company-settings?companyId=${companyId}`);
        if (!res.ok) throw new Error('Failed to load');
        const settings = await res.json();
        const appointmentSettings = settings?.appointment_settings as AppointmentSettings | undefined;

        if (appointmentSettings) {
          if (appointmentSettings.reminder_offsets) {
            setOffsets(appointmentSettings.reminder_offsets);
          }
          if (appointmentSettings.reminder_message_template) {
            setMessageTemplate(appointmentSettings.reminder_message_template);
          }
          if (appointmentSettings.reminder_delivery_hours) {
            setDeliveryHours(appointmentSettings.reminder_delivery_hours);
          }
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [companyId]);

  const handleSave = async () => {
    if (!companyId) return;

    setIsSaving(true);
    try {
      const res = await fetch('/api/company-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          settings: {
            appointment_settings: {
              reminder_offsets: offsets,
              reminder_message_template: messageTemplate,
              reminder_delivery_hours: deliveryHours,
            },
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro');

      toast({ title: 'Configurações salvas com sucesso!' });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar as configurações',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleOffset = (minutes: number) => {
    setOffsets(prev => {
      const existing = prev.find(o => o.minutes === minutes);
      if (existing) {
        return prev.map(o => 
          o.minutes === minutes ? { ...o, enabled: !o.enabled } : o
        );
      } else {
        const offsetConfig = AVAILABLE_OFFSETS.find(o => o.minutes === minutes);
        if (offsetConfig) {
          return [...prev, { ...offsetConfig, enabled: true }].sort((a, b) => a.minutes - b.minutes);
        }
        return prev;
      }
    });
  };

  const removeOffset = (minutes: number) => {
    setOffsets(prev => prev.filter(o => o.minutes !== minutes));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Seção: Lembretes Automáticos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Lembretes Automáticos
          </CardTitle>
          <CardDescription>
            Configure quando e como enviar lembretes de agendamento
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Quando enviar */}
          <div className="space-y-3">
            <Label>Quando enviar lembretes</Label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_OFFSETS.map((offset) => {
                const isActive = offsets.some(o => o.minutes === offset.minutes && o.enabled);
                return (
                  <Badge
                    key={offset.minutes}
                    variant={isActive ? 'default' : 'outline'}
                    className="cursor-pointer select-none"
                    onClick={() => toggleOffset(offset.minutes)}
                  >
                    {offset.label}
                    {isActive && (
                      <X 
                        className="h-3 w-3 ml-1" 
                        onClick={(e) => {
                          e.stopPropagation();
                          removeOffset(offset.minutes);
                        }}
                      />
                    )}
                  </Badge>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Clique para ativar/desativar cada intervalo de lembrete
            </p>
          </div>

          {/* Mensagem template */}
          <div className="space-y-2">
            <Label htmlFor="template">Mensagem do lembrete</Label>
            <Textarea
              id="template"
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              rows={4}
              placeholder="Digite a mensagem do lembrete..."
            />
            <p className="text-xs text-muted-foreground">
              Variáveis disponíveis: {'{nome}'}, {'{titulo}'}, {'{data}'}, {'{horario}'}, {'{local}'}, {'{duracao}'}
            </p>
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <Label>Preview da mensagem</Label>
            <div className="bg-muted p-4 rounded-lg text-sm">
              {messageTemplate
                .replace('{nome}', 'Maria')
                .replace('{titulo}', 'Consulta')
                .replace('{data}', '20/12/2024')
                .replace('{horario}', '14:30')
                .replace('{local}', 'Sala 101')
                .replace('{duracao}', '60 minutos')}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Seção: Horário de Envio */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Horário de Envio de Lembretes
          </CardTitle>
          <CardDescription>
            Defina um horário específico para envio de lembretes (evita envios de madrugada)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Restringir horário de envio</Label>
              <p className="text-xs text-muted-foreground">
                Lembretes fora do horário serão reagendados
              </p>
            </div>
            <Switch
              checked={deliveryHours.enabled}
              onCheckedChange={(checked) => 
                setDeliveryHours(prev => ({ ...prev, enabled: checked }))
              }
            />
          </div>

          {deliveryHours.enabled && (
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="start">Horário de início</Label>
                <Input
                  id="start"
                  type="time"
                  value={deliveryHours.start}
                  onChange={(e) => 
                    setDeliveryHours(prev => ({ ...prev, start: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end">Horário de término</Label>
                <Input
                  id="end"
                  type="time"
                  value={deliveryHours.end}
                  onChange={(e) => 
                    setDeliveryHours(prev => ({ ...prev, end: e.target.value }))
                  }
                />
              </div>
            </div>
          )}

          {deliveryHours.enabled && (
            <p className="text-sm text-muted-foreground bg-muted p-3 rounded">
              Lembretes só serão enviados entre <strong>{deliveryHours.start}</strong> e <strong>{deliveryHours.end}</strong>.
              Lembretes agendados fora deste período serão enviados no próximo horário válido.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Botão Salvar */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Salvar Configurações
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

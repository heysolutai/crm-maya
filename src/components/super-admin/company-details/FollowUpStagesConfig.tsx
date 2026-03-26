import { Clock, MessageSquare } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import type { FollowUpStage } from '@/hooks/useAIConfigurations';

type TimeUnit = 'minutes' | 'hours' | 'days';

const convertToHours = (value: number, unit: TimeUnit): number => {
  switch (unit) {
    case 'minutes': return value / 60;
    case 'hours': return value;
    case 'days': return value * 24;
    default: return value;
  }
};

const convertFromHours = (hours: number): { value: number; unit: TimeUnit } => {
  if (hours < 1) {
    return { value: Math.round(hours * 60), unit: 'minutes' };
  } else if (hours < 24) {
    return { value: hours, unit: 'hours' };
  } else {
    return { value: Math.round(hours / 24 * 10) / 10, unit: 'days' };
  }
};

interface FollowUpStagesConfigProps {
  stages: FollowUpStage[];
  onChange: (stages: FollowUpStage[]) => void;
}

export function FollowUpStagesConfig({ stages, onChange }: FollowUpStagesConfigProps) {
  const updateStage = (index: number, field: keyof FollowUpStage, value: string | number | boolean) => {
    const newStages = [...stages];
    newStages[index] = { ...newStages[index], [field]: value };
    onChange(newStages);
  };

  const updateDelay = (index: number, value: number, unit: TimeUnit) => {
    const hours = convertToHours(value, unit);
    updateStage(index, 'delay_hours', hours);
  };

  return (
    <div className="space-y-4">
      {stages.map((stage, index) => {
        const { value: displayValue, unit: displayUnit } = convertFromHours(stage.delay_hours);
        const isEnabled = stage.enabled !== false; // default true for retrocompatibility
        
        return (
          <Card key={stage.order} className={!isEnabled ? 'opacity-50' : ''}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  FUP {stage.order}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`stage-enabled-${index}`} className="text-sm text-muted-foreground">
                    {isEnabled ? 'Ativo' : 'Desativado'}
                  </Label>
                  <Switch
                    id={`stage-enabled-${index}`}
                    checked={isEnabled}
                    onCheckedChange={(v) => updateStage(index, 'enabled', v)}
                  />
                </div>
              </div>
              <CardDescription>
                Configurar janela de follow-up {stage.order}
              </CardDescription>
            </CardHeader>
            {isEnabled && (
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <Label>Tempo de espera após último contato</Label>
                  
                  <div className="flex items-start gap-4">
                    <Input
                      type="number"
                      min={1}
                      value={displayValue}
                      onChange={(e) => {
                        const newValue = parseInt(e.target.value) || 1;
                        updateDelay(index, newValue, displayUnit);
                      }}
                      className="w-24"
                      placeholder="Ex: 5"
                    />
                    
                    <RadioGroup 
                      value={displayUnit} 
                      onValueChange={(unit: TimeUnit) => {
                        updateDelay(index, displayValue, unit);
                      }}
                      className="flex-1"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="minutes" id={`minutes-${index}`} />
                          <Label htmlFor={`minutes-${index}`} className="font-normal cursor-pointer">
                            Minutos
                          </Label>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="hours" id={`hours-${index}`} />
                          <Label htmlFor={`hours-${index}`} className="font-normal cursor-pointer">
                            Horas
                          </Label>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="days" id={`days-${index}`} />
                          <Label htmlFor={`days-${index}`} className="font-normal cursor-pointer">
                            Dias
                          </Label>
                        </div>
                      </div>
                    </RadioGroup>
                  </div>
                  
                  <p className="text-xs text-muted-foreground">
                    = {stage.delay_hours.toFixed(2)} horas após o último contato do cliente
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`message-${index}`} className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Mensagem de follow-up
                  </Label>
                  <Textarea
                    id={`message-${index}`}
                    value={stage.message}
                    onChange={(e) => updateStage(index, 'message', e.target.value)}
                    placeholder="Digite a mensagem que será enviada..."
                    rows={3}
                    maxLength={500}
                  />
                  <p className="text-xs text-muted-foreground">
                    {stage.message.length}/500 caracteres
                  </p>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

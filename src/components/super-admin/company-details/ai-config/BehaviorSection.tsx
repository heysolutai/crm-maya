import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { BehaviorSettings } from "@/hooks/useAIConfigurations";

interface BehaviorSectionProps {
  settings: BehaviorSettings;
  onSettingsChange: (settings: BehaviorSettings) => void;
}

export function BehaviorSection({ settings, onSettingsChange }: BehaviorSectionProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="response-delay">⌛ Tempo de Digitação Humana (segundos)</Label>
        <div className="flex items-center gap-4">
          <Slider
            id="response-delay"
            min={0}
            max={120}
            step={1}
            value={[settings.response_delay_seconds]}
            onValueChange={(value) => 
              onSettingsChange({ ...settings, response_delay_seconds: value[0] })
            }
            className="flex-1"
          />
          <span className="w-12 text-center font-medium">{settings.response_delay_seconds}s</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Tempo de espera antes da IA responder. Durante este período, o indicador "digitando..." será exibido no WhatsApp do cliente.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="debounce-delay">⏳ Tempo de Espera do Cliente (segundos)</Label>
        <div className="flex items-center gap-4">
          <Slider
            id="debounce-delay"
            min={5}
            max={60}
            step={5}
            value={[settings.message_debounce_seconds || 35]}
            onValueChange={(value) => 
              onSettingsChange({ ...settings, message_debounce_seconds: value[0] })
            }
            className="flex-1"
          />
          <span className="w-12 text-center font-medium">{settings.message_debounce_seconds || 35}s</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Aguarda o cliente parar de enviar mensagens antes da IA processar (5-60 segundos)
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="temperature">🌡️ Temperatura da IA</Label>
        <div className="flex items-center gap-4">
          <Slider
            id="temperature"
            min={0.01}
            max={1}
            step={0.01}
            value={[settings.temperature ?? 0.4]}
            onValueChange={(value) => 
              onSettingsChange({ ...settings, temperature: value[0] })
            }
            className="flex-1"
          />
          <span className="w-16 text-center font-medium">{(settings.temperature ?? 0.4).toFixed(2)}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {(settings.temperature ?? 0.4) <= 0.3 
            ? "🎯 Baixa: Respostas mais previsíveis e conservadoras"
            : (settings.temperature ?? 0.4) <= 0.7 
              ? "⚖️ Média: Equilíbrio entre criatividade e consistência"
              : "✨ Alta: Respostas mais criativas e variadas"
          }
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="audio-percentage">🔊 Respostas em Áudio</Label>
        <div className="flex items-center gap-4">
          <Slider
            id="audio-percentage"
            min={0}
            max={1}
            step={0.1}
            value={[settings.audio_response_percentage ?? 0]}
            onValueChange={(value) => 
              onSettingsChange({ ...settings, audio_response_percentage: value[0] })
            }
            className="flex-1"
          />
          <span className="w-12 text-center font-medium">{(settings.audio_response_percentage ?? 0).toFixed(1)}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Probabilidade de enviar respostas em áudio (0.0 = só texto, 1.0 = só áudio)
        </p>
      </div>


      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="use-emojis">Usar Emojis</Label>
          <p className="text-sm text-muted-foreground">
            Adiciona emojis nas respostas para torná-las mais amigáveis
          </p>
        </div>
        <Switch
          id="use-emojis"
          checked={settings.use_emojis}
          onCheckedChange={(checked) => 
            onSettingsChange({ ...settings, use_emojis: checked })
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="max-messages">
          Máximo de mensagens antes de transferir para humano
        </Label>
        <Input
          id="max-messages"
          type="number"
          min={1}
          max={50}
          value={settings.max_messages_before_transfer}
          onChange={(e) => 
            onSettingsChange({ 
              ...settings, 
              max_messages_before_transfer: parseInt(e.target.value) || 10 
            })
          }
        />
        <p className="text-sm text-muted-foreground">
          Após este limite, a conversa é transferida para um agente humano
        </p>
      </div>
    </div>
  );
}

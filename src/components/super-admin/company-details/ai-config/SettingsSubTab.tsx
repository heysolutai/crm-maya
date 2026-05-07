import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAIConfigurations } from '@/hooks/useAIConfigurations';
import { useToast } from '@/hooks/use-toast';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { BehaviorSection } from './BehaviorSection';
import { Save, Webhook } from 'lucide-react';
import { DEFAULT_BEHAVIOR_SETTINGS, type BehaviorSettings } from '@/lib/aiConfig';

interface SettingsSubTabProps {
  companyId: string;
  agentId?: string;
}

export function SettingsSubTab({ companyId, agentId }: SettingsSubTabProps) {
  const { toast } = useToast();
  const { configurations, updateConfiguration, isUpdating } = useAIConfigurations(
    agentId ? { companyId, agentId } : companyId
  );
  const { setDirty } = useUnsavedChanges();
  
  const existingConfig = configurations?.[0];
  
  const [behaviorSettings, setBehaviorSettings] = useState<BehaviorSettings>({ ...DEFAULT_BEHAVIOR_SETTINGS });
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState<string>('');

  useEffect(() => {
    if (existingConfig) {
      setBehaviorSettings({
        ...DEFAULT_BEHAVIOR_SETTINGS,
        ...existingConfig.behavior_settings,
      });
      setN8nWebhookUrl(existingConfig.n8n_webhook_url || '');
    }
  }, [existingConfig]);

  const handleBehaviorChange = (settings: BehaviorSettings) => {
    setBehaviorSettings(settings);
    setDirty(true);
  };

  const handleSave = async () => {
    if (!existingConfig) {
      toast({
        title: "Erro",
        description: "Crie primeiro a configuração básica na aba Prompts",
        variant: "destructive",
      });
      return;
    }

    updateConfiguration(
      {
        id: existingConfig.id,
        updates: {
          behavior_settings: behaviorSettings,
          n8n_webhook_url: n8nWebhookUrl.trim() || null,
        },
      },
      {
        onSuccess: () => {
          setDirty(false);
          toast({ title: 'Configurações atualizadas com sucesso!' });
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Integração N8N
          </h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="n8n-webhook-url">URL do Webhook N8N</Label>
              <Input
                id="n8n-webhook-url"
                type="url"
                value={n8nWebhookUrl}
                onChange={(e) => { setN8nWebhookUrl(e.target.value); setDirty(true); }}
                placeholder="https://seu-n8n.com/webhook/..."
              />
              <p className="text-sm text-muted-foreground">
                URL personalizada para receber mensagens desta empresa. Se não preenchido, usa o webhook global do sistema.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold mb-4">🤖 Comportamento da IA</h3>
          <BehaviorSection
            settings={behaviorSettings}
            onSettingsChange={handleBehaviorChange}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isUpdating}>
          {isUpdating ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent mr-2" />
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

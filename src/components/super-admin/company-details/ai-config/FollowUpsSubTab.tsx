import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAIConfigurations, FollowUpStage } from '@/hooks/useAIConfigurations';
import { useToast } from '@/hooks/use-toast';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { FollowUpStagesConfig } from '../FollowUpStagesConfig';
import { Save, Sparkles, RefreshCw } from 'lucide-react';

interface FollowUpsSubTabProps {
  companyId: string;
}

const defaultFollowUpStages: FollowUpStage[] = [
  { order: 1, delay_hours: 24, message: "Olá [client_name]! Vi que você demonstrou interesse. Posso ajudar com algo?", enabled: true },
  { order: 2, delay_hours: 72, message: "Oi [client_name]! Ainda estou à disposição para tirar suas dúvidas. 😊", enabled: true },
  { order: 3, delay_hours: 168, message: "Olá! Passando para ver se posso ajudar você de alguma forma.", enabled: true },
  { order: 4, delay_hours: 336, message: "Oi [client_name]! Estou por aqui caso precise. 👋", enabled: false },
  { order: 5, delay_hours: 720, message: "Olá! Esta é minha última tentativa de contato. Se precisar, estarei aqui!", enabled: false },
  { order: 6, delay_hours: 1080, message: "Oi [client_name]! Ainda temos condições especiais para você. Quer saber mais?", enabled: false },
  { order: 7, delay_hours: 1440, message: "Olá [client_name]! Não quero ser inconveniente, mas estou aqui se precisar. 😊", enabled: false },
  { order: 8, delay_hours: 2160, message: "Oi [client_name]! Faz um tempo que não conversamos. Posso ajudar em algo?", enabled: false },
  { order: 9, delay_hours: 4320, message: "Olá [client_name]! Estamos com novidades que podem te interessar!", enabled: false },
  { order: 10, delay_hours: 8760, message: "Oi [client_name]! Passando para lembrar que estamos à disposição. Até breve! 👋", enabled: false },
];

export function FollowUpsSubTab({ companyId }: FollowUpsSubTabProps) {
  const { toast } = useToast();
  const { configurations, updateConfiguration, isUpdating } = useAIConfigurations(companyId);
  const { setDirty } = useUnsavedChanges();
  
  const existingConfig = configurations?.[0];
  
  const [followUpStages, setFollowUpStages] = useState<FollowUpStage[]>(defaultFollowUpStages);

  useEffect(() => {
    if (existingConfig) {
      setFollowUpStages(
        existingConfig.follow_up_stages?.length > 0
          ? existingConfig.follow_up_stages
          : defaultFollowUpStages
      );
    }
  }, [existingConfig]);

  const handleSaveFollowUps = async () => {
    if (!existingConfig) {
      toast({
        title: "Erro",
        description: "Crie primeiro a configuração básica na aba Prompts",
        variant: "destructive",
      });
      return;
    }

    const hasAnyEnabled = followUpStages.some(s => s.enabled !== false);
    updateConfiguration(
      {
        id: existingConfig.id,
        updates: {
          follow_up_enabled: hasAnyEnabled,
          follow_up_stages: followUpStages,
        },
      },
      {
        onSuccess: () => {
          setDirty(false);
          toast({ title: 'Follow-ups atualizados com sucesso!' });
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="follow-ups" className="space-y-6">
        <TabsList className="grid w-full grid-cols-1">
          <TabsTrigger value="follow-ups" className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Follow-ups
          </TabsTrigger>
        </TabsList>

        <TabsContent value="follow-ups">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className="h-5 w-5" />
                  Follow-ups Automáticos
                </CardTitle>
                <CardDescription>
                  Ative apenas as etapas que desejar — até 10 janelas de follow-up disponíveis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FollowUpStagesConfig 
                  stages={followUpStages} 
                  onChange={(s) => { setFollowUpStages(s); setDirty(true); }} 
                />
              </CardContent>
            </Card>

            <Card className="bg-muted/50 border-primary/20">
              <CardContent className="pt-6">
                <div className="flex items-start gap-2">
                  <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                  <div className="space-y-3">
                    <p className="font-medium text-base">Variáveis disponíveis:</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <code className="bg-background px-3 py-1.5 rounded text-primary font-mono">
                          [client_name]
                        </code>
                        <p className="text-xs text-muted-foreground">Nome do cliente</p>
                      </div>
                      <div className="space-y-1">
                        <code className="bg-background px-3 py-1.5 rounded text-primary font-mono">
                          [company_name]
                        </code>
                        <p className="text-xs text-muted-foreground">Nome da empresa</p>
                      </div>
                      <div className="space-y-1">
                        <code className="bg-background px-3 py-1.5 rounded text-primary font-mono">
                          [time]
                        </code>
                        <p className="text-xs text-muted-foreground">Hora atual</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button onClick={handleSaveFollowUps} disabled={isUpdating}>
                {isUpdating ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent mr-2" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Salvar Follow-ups
                  </>
                )}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

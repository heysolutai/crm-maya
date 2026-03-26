import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Settings, Bot } from 'lucide-react';
import { Company } from '@/hooks/useCompanies';
import { WhatsAppConfigCard } from './WhatsAppConfigCard';

import { supabase } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

interface SettingsTabProps {
  company: Company;
}

export function SettingsTab({ company }: SettingsTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isUpdating, setIsUpdating] = useState(false);

  const companySettings = company.settings as Record<string, any> | null;
  const allowPromptEditing = companySettings?.allow_prompt_editing || false;

  const handleTogglePromptEditing = async (checked: boolean) => {
    setIsUpdating(true);
    try {
      const currentSettings = companySettings || {};
      const newSettings = { ...currentSettings, allow_prompt_editing: checked };

      const { error } = await supabase
        .from('companies')
        .update({ settings: newSettings })
        .eq('id', company.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['company', company.id] });
      toast({
        title: checked ? 'Edição de prompts habilitada' : 'Edição de prompts desabilitada',
        description: checked 
          ? 'A empresa agora pode editar seus próprios prompts' 
          : 'A empresa não pode mais editar prompts',
      });
    } catch (error) {
      console.error('Error updating settings:', error);
      toast({
        title: 'Erro ao atualizar',
        description: 'Não foi possível atualizar a configuração',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Configurações Gerais</h3>
        <p className="text-sm text-muted-foreground">
          Configurações da empresa e gerenciamento de conta
        </p>
      </div>

      {/* WhatsApp Configuration */}
      <WhatsAppConfigCard companyId={company.id} />


      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Outras Configurações
          </CardTitle>
          <CardDescription>
            Configurações adicionais do sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Permitir Edição de Prompts</p>
                  <p className="text-xs text-muted-foreground">
                    Permite que administradores da empresa editem os prompts da IA
                  </p>
                </div>
              </div>
              <Switch
                checked={allowPromptEditing}
                onCheckedChange={handleTogglePromptEditing}
                disabled={isUpdating}
              />
            </div>

            <div className="flex items-center justify-between py-2 border-b">
              <div>
                <p className="text-sm font-medium">Ativar/Desativar Empresa</p>
                <p className="text-xs text-muted-foreground">
                  Desativar empresa bloqueia acesso dos usuários
                </p>
              </div>
              <Badge variant={company.is_active ? 'default' : 'secondary'}>
                {company.is_active ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">Plano de Assinatura</p>
                <p className="text-xs text-muted-foreground">
                  Gerenciar plano e pagamentos
                </p>
              </div>
              <Button variant="outline" size="sm">
                Gerenciar Plano
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
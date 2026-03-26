import { useState, useEffect } from 'react';
import { Shield, Save, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

interface AIPermissionsConfigProps {
  companyId: string;
}

const AI_FEATURES = [
  { key: 'prompts', label: 'Prompts', description: 'Editar prompts de atendimento, agendamento e primeira mensagem' },
  { key: 'follow_ups', label: 'Automações / Follow-ups', description: 'Configurar etapas de follow-up automático' },
  { key: 'connections', label: 'Conexões', description: 'Gerenciar WhatsApp e Google Calendar' },
  { key: 'faq', label: 'FAQ / Base de Conhecimento', description: 'Gerenciar perguntas frequentes e base de conhecimento' },
  { key: 'integrations', label: 'Integrações (API Keys IA)', description: 'Configurar chaves de API dos provedores de IA (OpenAI, etc.)' },
  { key: 'api_keys', label: 'API Keys da Empresa', description: 'Gerenciar chaves de API para integração externa' },
  { key: 'settings', label: 'Ajustes de IA', description: 'Configurar modelo, idioma, comportamento e webhooks' },
  { key: 'playground', label: 'Playground', description: 'Testar a IA em tempo real com simulação de chat' },
] as const;

export type AIPermissionKey = typeof AI_FEATURES[number]['key'];

export interface AIPermissions {
  prompts: boolean;
  follow_ups: boolean;
  connections: boolean;
  faq: boolean;
  integrations: boolean;
  api_keys: boolean;
  settings: boolean;
  playground: boolean;
}

const DEFAULT_PERMISSIONS: AIPermissions = {
  prompts: false,
  follow_ups: false,
  connections: false,
  faq: false,
  integrations: false,
  api_keys: false,
  settings: false,
  playground: false,
};

export function AIPermissionsConfig({ companyId }: AIPermissionsConfigProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [permissions, setPermissions] = useState<AIPermissions>(DEFAULT_PERMISSIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('companies')
        .select('settings')
        .eq('id', companyId)
        .single();

      if (!error && data) {
        const settings = data.settings as Record<string, any> | null;
        const saved = settings?.ai_permissions as Partial<AIPermissions> | undefined;
        setPermissions({ ...DEFAULT_PERMISSIONS, ...saved });
      }
      setIsLoading(false);
    }
    load();
  }, [companyId]);

  const handleToggle = (key: AIPermissionKey) => {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAll = (value: boolean) => {
    const updated = Object.keys(permissions).reduce((acc, key) => {
      acc[key as AIPermissionKey] = value;
      return acc;
    }, {} as AIPermissions);
    setPermissions(updated);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Get current settings first
      const { data: current } = await supabase
        .from('companies')
        .select('settings')
        .eq('id', companyId)
        .single();

      const currentSettings = (current?.settings as Record<string, any>) || {};

      const { error } = await supabase
        .from('companies')
        .update({
          settings: { ...currentSettings, ai_permissions: permissions } as any,
        })
        .eq('id', companyId);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['company', companyId] });
      queryClient.invalidateQueries({ queryKey: ['company'] });
      toast({ title: 'Permissões de IA salvas com sucesso' });
    } catch (err: any) {
      toast({ title: 'Erro ao salvar permissões', description: err.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const allEnabled = Object.values(permissions).every(Boolean);
  const allDisabled = Object.values(permissions).every((v) => !v);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6" />
          Permissões de IA
        </h2>
        <p className="text-muted-foreground mt-1">
          Defina quais funcionalidades de IA o administrador da empresa terá acesso
        </p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Funcionalidades</CardTitle>
              <CardDescription>
                Habilite ou desabilite cada módulo individualmente
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleAll(true)}
                disabled={allEnabled}
              >
                Habilitar Tudo
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleAll(false)}
                disabled={allDisabled}
              >
                Desabilitar Tudo
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {AI_FEATURES.map((feature) => (
            <div
              key={feature.key}
              className="flex items-center justify-between rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted/50"
            >
              <div className="space-y-0.5">
                <Label htmlFor={feature.key} className="text-sm font-medium cursor-pointer">
                  {feature.label}
                </Label>
                <p className="text-xs text-muted-foreground">{feature.description}</p>
              </div>
              <Switch
                id={feature.key}
                checked={permissions[feature.key]}
                onCheckedChange={() => handleToggle(feature.key)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Salvar Permissões
        </Button>
      </div>
    </div>
  );
}

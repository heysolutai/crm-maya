import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useAIConfigurations } from '@/hooks/useAIConfigurations';
import { useToast } from '@/hooks/use-toast';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { Sparkles, Save, Bot } from 'lucide-react';
import { DEFAULT_PROMPTS } from '@/lib/aiConfig';

interface AIPromptsEditorProps {
  companyId: string;
  agentId?: string;
  variant?: 'full' | 'simple';
  showConfigInfo?: boolean;
  showVariablesCard?: boolean;
}

export function AIPromptsEditor({
  companyId,
  agentId,
  variant = 'simple',
  showConfigInfo = false,
  showVariablesCard = true,
}: AIPromptsEditorProps) {
  const { toast } = useToast();
  // Quando agentId esta presente, escopa a config a esse agente (1:1).
  // Sem agentId, cai no modo legado (por empresa, primeiro registro).
  const { configurations, createConfiguration, updateConfiguration, isCreating, isUpdating } = useAIConfigurations(
    agentId ? { companyId, agentId } : companyId
  );
  const { setDirty } = useUnsavedChanges();
  
  const existingConfig = configurations?.[0];
  const initializedRef = useRef(false);
  
  const [formData, setFormData] = useState({
    name: '',
    prompts: { prompt_completo: '' },
    is_active: true,
  });

  useEffect(() => {
    if (existingConfig?.id) {
      const p = existingConfig.prompts as any;
      // Se já tem prompt_completo, usa ele; senão monta a partir dos campos antigos
      const promptCompleto = p?.prompt_completo || [
        p?.persona && `## PERSONA\n${p.persona}`,
        p?.behavior && `## COMPORTAMENTO\n${p.behavior}`,
        p?.attendance_funnel && `## FUNIL DE ATENDIMENTO\n${p.attendance_funnel}`,
        p?.scheduling_funnel && `## FUNIL DE AGENDAMENTO\n${p.scheduling_funnel}`,
        p?.business_rules && `## REGRAS DE NEGÓCIO\n${p.business_rules}`,
      ].filter(Boolean).join('\n\n') || '';

      setFormData({
        name: existingConfig.name || '',
        prompts: {
          prompt_completo: promptCompleto,
        },
        is_active: existingConfig.is_active ?? true,
      });
      initializedRef.current = true;
    }
  }, [existingConfig?.id]);

  // Track dirty state when formData changes after initialization
  const handleFormChange = (updates: Partial<typeof formData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
    if (initializedRef.current) setDirty(true);
  };

  const handleSave = async () => {
    // Validações para variant="full"
    if (variant === 'full' && (!formData.name || formData.name.length < 3)) {
      toast({
        title: "Erro de validação",
        description: "O nome deve ter pelo menos 3 caracteres",
        variant: "destructive",
      });
      return;
    }

    if (!formData.prompts.prompt_completo || formData.prompts.prompt_completo.length < 50) {
      toast({
        title: "Erro de validação",
        description: "O prompt deve ter pelo menos 50 caracteres",
        variant: "destructive",
      });
      return;
    }

    if (existingConfig) {
      // Merge com prompts existentes
      const mergedPrompts = {
        ...existingConfig.prompts,
        ...formData.prompts,
      };

      const updates = variant === 'full' 
        ? { ...formData, prompts: mergedPrompts }
        : { prompts: mergedPrompts };

      updateConfiguration(
        { id: existingConfig.id, updates },
        { onSuccess: () => { setDirty(false); toast({ title: 'Configuração atualizada com sucesso!' }); } }
      );
    } else if (variant === 'full') {
      createConfiguration(
        // whatsapp_instance_id vincula o AiAgent recem-criado a ESTA inbox.
        // Sem isso o config era criado "orfao" (inbox.aiAgentId = null) e sumia
        // no reload — o toast dizia "salvo" mas o GET por agentId voltava vazio.
        { company_id: companyId, ...(agentId ? { whatsapp_instance_id: agentId } : {}), ...formData },
        { onSuccess: () => { setDirty(false); toast({ title: 'Configuração criada com sucesso!' }); } }
      );
    } else {
      toast({
        title: "Erro",
        description: "Nenhuma configuração de IA encontrada. Entre em contato com o suporte.",
        variant: "destructive",
      });
    }
  };

  const isSaving = isCreating || isUpdating;

  // Estado sem configuração
  if (!existingConfig && variant === 'simple') {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            Nenhuma configuração de IA encontrada para esta empresa.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Entre em contato com o suporte para configurar.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Informações Básicas - apenas para super-admin */}
      {showConfigInfo && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              Informações Básicas
            </h3>
            
            <div className="space-y-2">
              <Label htmlFor="config-name">Nome da Configuração</Label>
              <Input
                id="config-name"
                value={formData.name}
                onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setDirty(true); }}
                placeholder="Ex: Atendimento Automático Ótica Brasil"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="config-active">Configuração Ativa</Label>
              <Switch
                id="config-active"
                checked={formData.is_active}
                onCheckedChange={(value) => { setFormData({ ...formData, is_active: value }); setDirty(true); }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* PROMPT COMPLETO */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            PROMPT COMPLETO
          </h3>
          <p className="text-sm text-muted-foreground">
            Escreva aqui todas as instruções da IA: persona, comportamento, funis, regras de negócio, etc.
          </p>
          <Textarea
            value={formData.prompts.prompt_completo}
            onChange={(e) => { setFormData({ ...formData, prompts: { ...formData.prompts, prompt_completo: e.target.value } }); setDirty(true); }}
            placeholder={`Ex:
## PERSONA
Você é a Ana, assistente virtual da Ótica Premium. Simpática, profissional e conhecedora de óculos e lentes.

## COMPORTAMENTO
- Tom informal e humanizado
- Use emojis com moderação
- Responda sempre em português brasileiro

## FUNIL DE ATENDIMENTO
ETAPA 1 - Qualificação: Identificar necessidade do cliente
ETAPA 2 - Apresentação: Mostrar produtos relevantes
ETAPA 3 - Fechamento: Confirmar interesse e agendar

## REGRAS DE NEGÓCIO
- Horário: Seg-Sex 9h-18h, Sáb 9h-13h
- Pagamento: PIX, cartão até 6x, boleto
- Não oferecer descontos acima de 10%`}
            rows={variant === 'full' ? 30 : 20}
            className="font-mono text-sm"
          />
          <p className="text-sm text-muted-foreground">Mínimo de 50 caracteres</p>
        </CardContent>
      </Card>

      {/* Card de Variáveis */}
      {showVariablesCard && (
        <Card className="bg-muted/50 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-2">
              <Sparkles className="h-5 w-5 text-primary mt-0.5" />
              <div className="space-y-3">
                <p className="font-medium text-base">Variáveis disponíveis:</p>
                <p className="text-sm text-muted-foreground">
                  Use estas variáveis dentro dos prompts para personalizar as mensagens:
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <code className="bg-background px-3 py-1.5 rounded text-primary font-mono text-sm">
                      [client_name]
                    </code>
                    <p className="text-xs text-muted-foreground">Nome do cliente</p>
                  </div>
                  <div className="space-y-1">
                    <code className="bg-background px-3 py-1.5 rounded text-primary font-mono text-sm">
                      [company_name]
                    </code>
                    <p className="text-xs text-muted-foreground">Nome da empresa</p>
                  </div>
                  {variant === 'full' && (
                    <>
                      <div className="space-y-1">
                        <code className="bg-background px-3 py-1.5 rounded text-primary font-mono text-sm">
                          [time]
                        </code>
                        <p className="text-xs text-muted-foreground">Hora atual</p>
                      </div>
                      <div className="space-y-1">
                        <code className="bg-background px-3 py-1.5 rounded text-primary font-mono text-sm">
                          [date]
                        </code>
                        <p className="text-xs text-muted-foreground">Data atual</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Botão de Salvar */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent mr-2" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              {variant === 'full' ? (existingConfig ? 'Atualizar Configuração' : 'Criar Configuração') : 'Salvar Prompts'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useAIConfigurations } from '@/hooks/useAIConfigurations';
import { AIPromptsEditor } from '@/components/ai/AIPromptsEditor';
import { Loader2, Save, Bot, Sliders, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  companyId: string;
  agentId?: string;
}

const TONES = [
  { value: 'amigavel', label: 'Amigável', hint: 'Caloroso e simpático', promptText: 'Fale de forma calorosa, simpática e próxima, como um bom anfitrião recebendo o cliente.' },
  { value: 'formal', label: 'Formal', hint: 'Educado e profissional', promptText: 'Mantenha um tom educado, profissional e respeitoso o tempo todo.' },
  { value: 'descontraido', label: 'Descontraído', hint: 'Leve e divertido', promptText: 'Use um tom leve, descontraído e bem-humorado, sem perder a clareza.' },
];

const CAPABILITIES = [
  { value: 'duvidas', label: 'Tirar dúvidas', promptText: 'Responder dúvidas gerais dos clientes sobre o restaurante.' },
  { value: 'cardapio', label: 'Informar cardápio e preços', promptText: 'Informar pratos, cardápio e preços quando o cliente perguntar.' },
  { value: 'reservas', label: 'Registrar reservas', promptText: 'Ajudar o cliente a reservar uma mesa, coletando nome, data, horário e número de pessoas, e confirmando antes de registrar.' },
  { value: 'agendar', label: 'Agendar com as ferramentas', promptText: 'Usar as ferramentas (tools) disponíveis para consultar disponibilidade, criar e confirmar reservas/agendamentos diretamente no sistema. Sempre conclua a ação pelas ferramentas — nunca invente uma confirmação.' },
  { value: 'localizacao', label: 'Informar endereço e como chegar', promptText: 'Informar o endereço, a localização e como chegar ao restaurante.' },
];

interface SimpleForm {
  aiName: string;
  restaurantName: string;
  tone: string;
  hours: string;
  capabilities: string[];
  about: string;
}

const DEFAULT_FORM: SimpleForm = {
  aiName: '',
  restaurantName: '',
  tone: 'amigavel',
  hours: '',
  capabilities: ['duvidas', 'cardapio', 'reservas', 'agendar'],
  about: '',
};

function buildPromptCompleto(s: SimpleForm): string {
  const tone = TONES.find((t) => t.value === s.tone)?.promptText || '';
  const caps = CAPABILITIES.filter((c) => s.capabilities.includes(c.value))
    .map((c) => `- ${c.promptText}`)
    .join('\n');

  const nome = s.aiName.trim() || 'o atendente virtual';
  const rest = s.restaurantName.trim();

  return [
    `Você é ${nome}, atendente virtual${rest ? ` do restaurante ${rest}` : ''}. Atenda os clientes pelo WhatsApp.`,
    tone && `\n## TOM DE VOZ\n${tone}`,
    s.hours.trim() && `\n## HORÁRIO DE FUNCIONAMENTO\n${s.hours.trim()}`,
    caps && `\n## O QUE VOCÊ PODE FAZER\n${caps}`,
    s.about.trim() && `\n## SOBRE O RESTAURANTE\n${s.about.trim()}`,
    `\n## REGRAS GERAIS\n- Sempre cordial, claro e objetivo, em português do Brasil.\n- Para reservas, confirme data, horário e número de pessoas antes de registrar.\n- Quando precisar agendar, reservar ou consultar disponibilidade, use SEMPRE as ferramentas (tools) disponíveis — nunca invente confirmações ou horários.\n- Se não souber responder, ofereça encaminhar para um atendente humano.`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function SimpleAgentConfig({ companyId, agentId }: Props) {
  const { configurations, isLoading, updateConfiguration, isUpdating } = useAIConfigurations(
    agentId ? { companyId, agentId } : companyId
  );
  const existingConfig = configurations?.[0];

  const [advanced, setAdvanced] = useState(false);
  const [form, setForm] = useState<SimpleForm>(DEFAULT_FORM);
  const initedRef = useRef(false);

  useEffect(() => {
    if (existingConfig?.id && !initedRef.current) {
      const simple = (existingConfig.prompts as any)?.simple as Partial<SimpleForm> | undefined;
      setForm({
        ...DEFAULT_FORM,
        ...(simple || {}),
        // Sem config simples ainda? Usa o nome do agente como nome do restaurante.
        restaurantName: simple?.restaurantName || existingConfig.name || '',
      });
      initedRef.current = true;
    }
  }, [existingConfig?.id]);

  const set = (patch: Partial<SimpleForm>) => setForm((p) => ({ ...p, ...patch }));

  const toggleCap = (value: string) =>
    setForm((p) => ({
      ...p,
      capabilities: p.capabilities.includes(value)
        ? p.capabilities.filter((c) => c !== value)
        : [...p.capabilities, value],
    }));

  const handleSave = () => {
    if (!existingConfig) return;
    const prompt_completo = buildPromptCompleto(form);
    updateConfiguration({
      id: existingConfig.id,
      updates: {
        prompts: { ...(existingConfig.prompts as any), simple: form, prompt_completo } as any,
      },
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Modo avançado — o editor de prompt completo de sempre.
  if (advanced) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => setAdvanced(false)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar ao modo simples
        </Button>
        <AIPromptsEditor companyId={companyId} agentId={agentId} variant="full" showConfigInfo showVariablesCard />
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Bot className="h-5 w-5 text-primary" />
          </span>
          <div>
            <h3 className="text-base font-semibold">Configurar o agente de IA</h3>
            <p className="text-sm text-muted-foreground">
              Preencha o básico — a gente monta o resto pra você.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ai-name">Nome da IA</Label>
            <Input
              id="ai-name"
              placeholder="Ex: Sofia"
              value={form.aiName}
              onChange={(e) => set({ aiName: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rest-name">Nome do restaurante</Label>
            <Input
              id="rest-name"
              placeholder="Ex: Cantina da Nonna"
              value={form.restaurantName}
              onChange={(e) => set({ restaurantName: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Tom de voz</Label>
          <div className="grid grid-cols-3 gap-2">
            {TONES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => set({ tone: t.value })}
                className={cn(
                  'rounded-xl border p-3 text-left transition-colors',
                  form.tone === t.value
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border/60 hover:border-primary/40'
                )}
              >
                <p className="text-sm font-medium">{t.label}</p>
                <p className="text-xs text-muted-foreground">{t.hint}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="hours">Horário de funcionamento</Label>
          <Textarea
            id="hours"
            rows={2}
            placeholder="Ex: Seg a sex 11h-15h e 18h-23h. Sáb e dom 12h-23h."
            value={form.hours}
            onChange={(e) => set({ hours: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label>O que a IA pode fazer</Label>
          <div className="space-y-2">
            {CAPABILITIES.map((c) => (
              <div
                key={c.value}
                className="flex items-center justify-between rounded-xl border border-border/60 p-3"
              >
                <span className="text-sm font-medium">{c.label}</span>
                <Switch
                  checked={form.capabilities.includes(c.value)}
                  onCheckedChange={() => toggleCap(c.value)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="about">Sobre o restaurante (opcional)</Label>
          <Textarea
            id="about"
            rows={4}
            placeholder="Conte o que a IA precisa saber: tipo de comida, diferenciais, formas de pagamento, política de reservas, etc."
            value={form.about}
            onChange={(e) => set({ about: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Quanto mais contexto, melhor a IA responde.
          </p>
        </div>

        <div className="flex items-center justify-between pt-2 border-t gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => setAdvanced(true)}>
            <Sliders className="h-4 w-4 mr-2" />
            Modo avançado
          </Button>
          <Button onClick={handleSave} disabled={isUpdating || !existingConfig}>
            {isUpdating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar configuração
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

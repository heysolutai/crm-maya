"use client";

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bot, FileText, Info, Loader2, Save } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAIConfigurations, type Prompts } from '@/hooks/useAIConfigurations';
import { AIPromptsEditor } from '@/components/ai/AIPromptsEditor';
import { useSyncedDraft } from '@/components/agente-ia/useSyncedDraft';
import { cn } from '@/lib/utils';
import {
  TONES,
  VERBOSITY,
  DEFAULT_SIMPLE_FORM as DEFAULT_FORM,
  buildPromptCompleto,
  normalizeSimpleForm,
  type SimpleForm,
} from '@/lib/agentSimpleConfig';

interface Props {
  companyId: string;
  agentId?: string;
  /** Avisa quando há alterações ainda não salvas (para o aviso ao sair da tela). */
  onDirtyChange?: (dirty: boolean) => void;
}

type Modo = 'simples' | 'avancado';

const MODOS: { value: Modo; label: string; hint: string; icon: typeof Bot }[] = [
  { value: 'simples', label: 'Modo simples', hint: 'Preencha o básico: a gente monta o texto da IA', icon: Bot },
  { value: 'avancado', label: 'Prompt avançado', hint: 'Escreva você mesmo o texto inteiro da IA', icon: FileText },
];

type PromptsComSimple = Prompts & { simple?: unknown };

/** Compara textos ignorando diferença de quebra de linha e espaços nas pontas. */
function limpar(texto: string | undefined): string {
  return (texto ?? '').replace(/\r\n/g, '\n').trim();
}

export function SimpleAgentConfig({ companyId, agentId, onDirtyChange }: Props) {
  const { configurations, isLoading, updateConfiguration, isUpdating } = useAIConfigurations(
    agentId ? { companyId, agentId } : companyId
  );
  const existingConfig = configurations?.[0];

  const [confirmarOpen, setConfirmarOpen] = useState(false);
  // Modo escolhido na tela. null = ainda não escolheu: segue o que gerou o texto salvo.
  const [modoEscolhido, setModoEscolhido] = useState<Modo | null>(null);

  // O que está salvo. Sem configuração simples ainda, usa o nome do agente
  // como nome do restaurante.
  const server = useMemo<SimpleForm>(() => {
    if (!existingConfig) return DEFAULT_FORM;
    const salvo = normalizeSimpleForm((existingConfig.prompts as PromptsComSimple).simple);
    return { ...salvo, restaurantName: salvo.restaurantName || existingConfig.name || '' };
  }, [existingConfig]);

  const [form, setForm, alterado] = useSyncedDraft<SimpleForm>(server);

  useEffect(() => {
    onDirtyChange?.(alterado);
  }, [alterado, onDirtyChange]);

  const set = (patch: Partial<SimpleForm>) => setForm((p) => ({ ...p, ...patch }));

  /**
   * O texto que a IA usa hoje foi escrito fora deste formulário? (suporte, ou
   * uma versão antiga da tela). Salvar o formulário gera o texto de novo e
   * apagaria esse conteúdo: por isso a pessoa confirma antes.
   */
  const textoVeioDeFora = (): boolean => {
    if (!existingConfig) return false;
    const atual = limpar(existingConfig.prompts.prompt_completo);
    if (!atual) return false;
    const snapshot = (existingConfig.prompts as PromptsComSimple).simple;
    if (!snapshot || typeof snapshot !== 'object') return true;
    return atual !== limpar(buildPromptCompleto(normalizeSimpleForm(snapshot)));
  };

  const salvar = () => {
    if (!existingConfig) return;
    // O servidor mescla com os prompts que já existem: mandar só estas duas
    // chaves não mexe no resto. `capabilities` segue dentro de `form` com o
    // que já estava salvo (ou o padrão): não aparece mais na tela, mas o texto
    // gerado continua o mesmo.
    const prompts: Prompts & { simple: SimpleForm } = {
      simple: form,
      prompt_completo: buildPromptCompleto(form),
    };
    updateConfiguration({ id: existingConfig.id, updates: { prompts } });
  };

  const handleSave = () => {
    if (!existingConfig) return;
    if (textoVeioDeFora()) {
      setConfirmarOpen(true);
      return;
    }
    salvar();
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

  // Texto escrito no prompt avançado (ou pelo suporte) abre no avançado; o
  // gerado pelo formulário abre no simples. A pessoa troca quando quiser.
  const modo: Modo = modoEscolhido ?? (textoVeioDeFora() ? 'avancado' : 'simples');

  const seletorDeModo = (
    <div role="radiogroup" aria-label="Como configurar a IA" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {MODOS.map((m) => (
        <button
          key={m.value}
          type="button"
          role="radio"
          aria-checked={modo === m.value}
          onClick={() => setModoEscolhido(m.value)}
          className={cn(
            'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors',
            modo === m.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border/60 hover:border-primary/40'
          )}
        >
          <m.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            <span className="block text-sm font-medium">{m.label}</span>
            <span className="block text-xs text-muted-foreground">{m.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );

  if (modo === 'avancado') {
    return (
      <div className="space-y-4">
        {seletorDeModo}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Aqui você escreve o texto da IA do seu jeito. O sistema continua somando sozinho o roteiro das ferramentas,
            as regras do WhatsApp e a data de hoje. Se voltar para o modo simples e salvar o formulário, este texto é
            substituído.
          </AlertDescription>
        </Alert>
        {existingConfig ? (
          <AIPromptsEditor
            key={`${existingConfig.id}:${existingConfig.updated_at}`}
            companyId={companyId}
            agentId={agentId}
            variant="simple"
            showVariablesCard
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {seletorDeModo}
      {textoVeioDeFora() && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            O texto que a IA usa hoje foi escrito no prompt avançado. Se você salvar este formulário, ele será trocado por
            um texto novo, montado com o que está preenchido aqui.
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardContent className="p-4 sm:p-6 space-y-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Bot className="h-5 w-5 text-primary" />
            </span>
            <div>
              <h3 className="text-base font-semibold">Configurar o agente de IA</h3>
              <p className="text-sm text-muted-foreground">
                Preencha o básico: a gente monta o resto pra você.
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
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
            <Label>Como a IA responde</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {VERBOSITY.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => set({ verbosity: v.value })}
                  className={cn(
                    'rounded-xl border p-3 text-left transition-colors',
                    form.verbosity === v.value
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border/60 hover:border-primary/40'
                  )}
                >
                  <p className="text-sm font-medium">{v.label}</p>
                  <p className="text-xs text-muted-foreground">{v.hint}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Endereço</Label>
            <Input
              id="address"
              placeholder="Ex: Rua das Flores, 120, Setor Bueno, Goiânia"
              value={form.address}
              onChange={(e) => set({ address: e.target.value })}
            />
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
            <Label htmlFor="reservation-hours">Horários para reserva</Label>
            <Input
              id="reservation-hours"
              placeholder="Ex: 19h às 22h, de terça a domingo"
              value={form.reservationHours}
              onChange={(e) => set({ reservationHours: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Preenchido, a IA fica proibida de oferecer reserva fora dessa janela. Em branco,
              ela usa o horário de funcionamento como referência.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prices">Preços</Label>
            <Textarea
              id="prices"
              rows={2}
              placeholder="Ex: Pratos de R$ 45 a R$ 90. Couvert R$ 18. Taxa de serviço 10%."
              value={form.prices}
              onChange={(e) => set({ prices: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="about">Instruções extras (opcional)</Label>
            <Textarea
              id="about"
              rows={4}
              placeholder="Ex: Não aceitamos reservas para mais de 12 pessoas. Temos opções sem glúten."
              value={form.about}
              onChange={(e) => set({ about: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Qualquer regra ou informação que a IA deve seguir. Ex.: não aceitamos reservas para mais de 12 pessoas.
            </p>
          </div>

          <div className="flex items-center justify-end pt-2 border-t">
            <Button onClick={handleSave} disabled={isUpdating || !existingConfig} className="w-full sm:w-auto">
              {isUpdating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar configuração
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmarOpen}
        onOpenChange={setConfirmarOpen}
        title="Substituir o texto atual da IA?"
        description="O texto que a IA usa hoje foi escrito fora deste formulário (por exemplo, pelo suporte). Se você salvar, ele será trocado por um texto novo, montado com o que está preenchido aqui."
        confirmLabel="Salvar mesmo assim"
        cancelLabel="Voltar"
        onConfirm={salvar}
      />
    </div>
  );
}

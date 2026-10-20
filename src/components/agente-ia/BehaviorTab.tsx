'use client';

import { useEffect, useMemo } from 'react';
import { Loader2, MessageCircle, Save, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { AiPauseCard } from '@/components/integrations/AiPauseCard';
import { useAuth } from '@/hooks/useAuth';
import { useAIConfigurations, type AgentEngine, type AIConfiguration } from '@/hooks/useAIConfigurations';
import { DEFAULT_BEHAVIOR_SETTINGS, type BehaviorSettings } from '@/lib/aiConfig';
import { useSyncedDraft } from './useSyncedDraft';

interface Props {
  companyId: string;
  agentId: string;
  /** Mostra "Configurações técnicas (suporte)": super-admin ou permissão "settings". */
  showTechnical: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}

const ESPERA_MIN = 5;
const ESPERA_MAX = 60;
const DIGITACAO_MAX = 120;
const MENSAGENS_MIN = 1;
const MENSAGENS_MAX = 50;

/** Valores da tela. Os campos de texto ficam como texto até a hora de salvar. */
interface Draft {
  espera: number;
  digitacao: number;
  emojis: boolean;
  maxMensagens: string;
  criatividade: number;
  audio: number;
  motor: AgentEngine;
  webhookUrl: string;
}

const RASCUNHO_INICIAL: Draft = {
  espera: DEFAULT_BEHAVIOR_SETTINGS.message_debounce_seconds,
  digitacao: DEFAULT_BEHAVIOR_SETTINGS.response_delay_seconds,
  emojis: DEFAULT_BEHAVIOR_SETTINGS.use_emojis,
  maxMensagens: String(DEFAULT_BEHAVIOR_SETTINGS.max_messages_before_transfer),
  criatividade: DEFAULT_BEHAVIOR_SETTINGS.temperature,
  audio: DEFAULT_BEHAVIOR_SETTINGS.audio_response_percentage,
  motor: 'n8n',
  webhookUrl: '',
};

function limitar(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function doServidor(config: AIConfiguration | undefined): Draft {
  if (!config) return RASCUNHO_INICIAL;
  const b: BehaviorSettings = { ...DEFAULT_BEHAVIOR_SETTINGS, ...config.behavior_settings };
  return {
    // Mesma regra da tela antiga: 0 ou vazio volta para o padrão de espera.
    espera: limitar(b.message_debounce_seconds || DEFAULT_BEHAVIOR_SETTINGS.message_debounce_seconds, ESPERA_MIN, ESPERA_MAX),
    digitacao: limitar(b.response_delay_seconds ?? DEFAULT_BEHAVIOR_SETTINGS.response_delay_seconds, 0, DIGITACAO_MAX),
    emojis: b.use_emojis ?? DEFAULT_BEHAVIOR_SETTINGS.use_emojis,
    maxMensagens: String(b.max_messages_before_transfer ?? DEFAULT_BEHAVIOR_SETTINGS.max_messages_before_transfer),
    criatividade: limitar(b.temperature ?? DEFAULT_BEHAVIOR_SETTINGS.temperature, 0.01, 1),
    audio: limitar(b.audio_response_percentage ?? 0, 0, 1),
    motor: config.engine,
    webhookUrl: config.n8n_webhook_url ?? '',
  };
}

function rotuloSegundos(n: number): string {
  return `${n} ${n === 1 ? 'segundo' : 'segundos'}`;
}

/**
 * Agente de IA › Comportamento.
 *
 * Controles simples, sem termos técnicos. Cada um grava na MESMA chave de
 * `behavior_settings` que a tela antiga de Ajustes usava, mesclando com o que
 * já estava salvo (nada que esta tela não mostra é apagado).
 */
export function BehaviorTab({ companyId, agentId, showTechnical, onDirtyChange }: Props) {
  const { role, isSuperAdmin } = useAuth();
  const { configurations, isLoading, updateConfiguration, isUpdating } = useAIConfigurations({ companyId, agentId });
  const config = configurations?.[0];

  const server = useMemo(() => doServidor(config), [config]);
  const [draft, setDraft, alterado] = useSyncedDraft<Draft>(server);

  useEffect(() => {
    onDirtyChange?.(alterado);
  }, [alterado, onDirtyChange]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const maxNumero = Number(draft.maxMensagens);
  const maxValido =
    draft.maxMensagens.trim() !== '' &&
    Number.isInteger(maxNumero) &&
    maxNumero >= MENSAGENS_MIN &&
    maxNumero <= MENSAGENS_MAX;

  const salvar = () => {
    if (!config || !maxValido) return;

    const behavior_settings: BehaviorSettings = {
      ...config.behavior_settings,
      message_debounce_seconds: draft.espera,
      response_delay_seconds: draft.digitacao,
      use_emojis: draft.emojis,
      max_messages_before_transfer: maxNumero,
      ...(showTechnical
        ? { temperature: draft.criatividade, audio_response_percentage: draft.audio }
        : {}),
    };

    const updates: Partial<AIConfiguration> = { behavior_settings };
    if (showTechnical) {
      // Só o suporte troca quem responde (a rota recusa os demais com 403).
      if (isSuperAdmin && draft.motor !== server.motor) updates.engine = draft.motor;
      const url = draft.webhookUrl.trim();
      if (url !== server.webhookUrl.trim()) updates.n8n_webhook_url = url || null;
    }

    updateConfiguration({ id: config.id, updates });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!config) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          A IA ainda não foi preparada para esta conexão. Fale com o suporte.
        </CardContent>
      </Card>
    );
  }

  const podeEditarPausa = isSuperAdmin || role === 'company_admin';

  return (
    <div className="space-y-6">
      <AiPauseCard canEdit={podeEditarPausa} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageCircle className="h-5 w-5 text-primary" />
            Como a IA conversa
          </CardTitle>
          <CardDescription>Ajuste o ritmo e o jeito das respostas da IA no WhatsApp.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="comportamento-espera">Esperar o cliente terminar de escrever</Label>
              <span className="shrink-0 text-sm font-medium tabular-nums">{rotuloSegundos(draft.espera)}</span>
            </div>
            <Slider
              id="comportamento-espera"
              min={ESPERA_MIN}
              max={ESPERA_MAX}
              step={5}
              value={[draft.espera]}
              onValueChange={([v]) => set({ espera: v })}
            />
            <p className="text-sm text-muted-foreground">
              Depois da última mensagem do cliente, a IA espera esse tempo antes de responder. Assim ela lê tudo
              de uma vez, em vez de responder cada mensagem separada.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="comportamento-digitacao">Simular digitação</Label>
              <span className="shrink-0 text-sm font-medium tabular-nums">{rotuloSegundos(draft.digitacao)}</span>
            </div>
            <Slider
              id="comportamento-digitacao"
              min={0}
              max={DIGITACAO_MAX}
              step={1}
              value={[draft.digitacao]}
              onValueChange={([v]) => set({ digitacao: v })}
            />
            <p className="text-sm text-muted-foreground">
              Antes de enviar a resposta, aparece &quot;digitando...&quot; no WhatsApp do cliente por esse tempo.
            </p>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="comportamento-emojis" className="cursor-pointer">
                Usar emojis
              </Label>
              <p className="text-sm text-muted-foreground">A IA coloca emojis nas respostas para ficar mais simpática.</p>
            </div>
            <Switch
              id="comportamento-emojis"
              checked={draft.emojis}
              onCheckedChange={(v) => set({ emojis: v })}
              className="mt-0.5"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="comportamento-max-mensagens">Máximo de mensagens antes de chamar um atendente</Label>
            <Input
              id="comportamento-max-mensagens"
              type="number"
              inputMode="numeric"
              min={MENSAGENS_MIN}
              max={MENSAGENS_MAX}
              step={1}
              value={draft.maxMensagens}
              onChange={(e) => set({ maxMensagens: e.target.value })}
              aria-invalid={!maxValido}
              className="w-28"
            />
            <p className={maxValido ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>
              {maxValido
                ? 'Quando a IA chegar nesse número de mensagens na conversa, ela chama um atendente.'
                : `Use um número inteiro de ${MENSAGENS_MIN} a ${MENSAGENS_MAX}.`}
            </p>
          </div>

          {showTechnical && (
            <div className="space-y-5 rounded-lg border border-dashed p-4">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Wrench className="h-4 w-4 text-muted-foreground" />
                  Configurações técnicas (suporte)
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Normalmente só o suporte mexe aqui.
                </p>
              </div>

              {isSuperAdmin && (
                <div className="space-y-2">
                  <Label>Quem responde</Label>
                  <RadioGroup
                    value={draft.motor}
                    onValueChange={(v) => set({ motor: v === 'maestro' ? 'maestro' : 'n8n' })}
                    className="grid gap-2 sm:grid-cols-2"
                  >
                    <Label
                      htmlFor="motor-n8n"
                      className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal"
                    >
                      <RadioGroupItem id="motor-n8n" value="n8n" className="mt-0.5" />
                      <span>
                        <span className="block text-sm font-medium">n8n</span>
                        <span className="block text-xs text-muted-foreground">Fluxo atual</span>
                      </span>
                    </Label>
                    <Label
                      htmlFor="motor-maestro"
                      className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal"
                    >
                      <RadioGroupItem id="motor-maestro" value="maestro" className="mt-0.5" />
                      <span>
                        <span className="block text-sm font-medium">Maestro</span>
                        <span className="block text-xs text-muted-foreground">Motor próprio</span>
                      </span>
                    </Label>
                  </RadioGroup>
                </div>
              )}

              {draft.motor === 'n8n' && (
                <div className="space-y-2">
                  <Label htmlFor="comportamento-webhook">URL do webhook do n8n</Label>
                  <Input
                    id="comportamento-webhook"
                    type="url"
                    value={draft.webhookUrl}
                    onChange={(e) => set({ webhookUrl: e.target.value })}
                    placeholder="https://seu-n8n.com/webhook/..."
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    Em branco, usa o endereço padrão do sistema.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="comportamento-criatividade">Criatividade da IA</Label>
                  <span className="shrink-0 text-sm font-medium tabular-nums">{draft.criatividade.toFixed(2)}</span>
                </div>
                <Slider
                  id="comportamento-criatividade"
                  min={0.01}
                  max={1}
                  step={0.01}
                  value={[draft.criatividade]}
                  onValueChange={([v]) => set({ criatividade: v })}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Mais direta</span>
                  <span>Mais criativa</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="comportamento-audio">Respostas em áudio</Label>
                  <span className="shrink-0 text-sm font-medium tabular-nums">{Math.round(draft.audio * 100)}%</span>
                </div>
                <Slider
                  id="comportamento-audio"
                  min={0}
                  max={1}
                  step={0.1}
                  value={[draft.audio]}
                  onValueChange={([v]) => set({ audio: v })}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Só texto</span>
                  <span>Só áudio</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end border-t pt-4">
            <Button onClick={salvar} disabled={isUpdating || !alterado || !maxValido} className="w-full sm:w-auto">
              {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

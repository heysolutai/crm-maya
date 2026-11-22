"use client";

import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { useInboxes } from '@/hooks/useInboxes';
import { perfilDoAgente } from '@/lib/agentProfile';
import {
  TONES,
  VERBOSITY,
  CAMPOS_TEXTO,
  DEFAULT_SIMPLE_FORM as DEFAULT_FORM,
  buildPromptCompleto,
  normalizeSimpleForm,
  type CampoTextoSimples,
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

/** Grupo de campos do formulário, com um título discreto. */
function Secao({ titulo, separada, children }: { titulo: string; separada?: boolean; children: ReactNode }) {
  return (
    <section className={cn('space-y-4', separada && 'border-t pt-6')}>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h4>
      {children}
    </section>
  );
}

/**
 * Campo de texto livre opcional. Rótulo, explicação, exemplo e limite vêm de
 * CAMPOS_TEXTO (a mesma fonte que o MCP usa). O contador só aparece perto do limite.
 */
function CampoTexto({
  id,
  campo,
  valor,
  onChange,
  rows = 3,
  dica,
}: {
  id: string;
  campo: CampoTextoSimples;
  valor: string;
  onChange: (valor: string) => void;
  rows?: number;
  /** Troca a explicação padrão (ex.: texto próprio para restaurante do Reserve Maya). */
  dica?: string;
}) {
  const info = CAMPOS_TEXTO[campo];
  const pertoDoLimite = valor.length > info.max * 0.8;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {info.rotulo} <span className="font-normal text-muted-foreground">(opcional)</span>
      </Label>
      <Textarea
        id={id}
        rows={rows}
        maxLength={info.max}
        placeholder={`Ex.: ${info.exemplo}`}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
        <p>{dica ?? info.paraQueServe}</p>
        {pertoDoLimite && (
          <span className="shrink-0 tabular-nums">
            {valor.length}/{info.max}
          </span>
        )}
      </div>
    </div>
  );
}

export function SimpleAgentConfig({ companyId, agentId, onDirtyChange }: Props) {
  const { configurations, isLoading, updateConfiguration, isUpdating } = useAIConfigurations(
    agentId ? { companyId, agentId } : companyId
  );
  const existingConfig = configurations?.[0];
  // Tipo do agente: vem da conexão (com ID do Reserve Maya = restaurante Reserve Maya).
  const { inboxes } = useInboxes();

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
  // O modo cujo texto está salvo e indo para a IA (só um vale de cada vez).
  // Sem texto salvo, nenhum: a IA usa um texto padrão curto.
  const temTextoSalvo = !!limpar(existingConfig?.prompts.prompt_completo);
  const emUso: Modo | null = temTextoSalvo ? (textoVeioDeFora() ? 'avancado' : 'simples') : null;

  // Restaurante do Reserve Maya: horários, reservas e preços vêm do sistema de
  // reservas e da base de conhecimento. Os campos somem do formulário; quem já
  // tinha preenchido continua vendo (com aviso), para o texto da IA não mudar
  // sem ninguém pedir.
  const reserveMaya = perfilDoAgente(existingConfig?.id, inboxes) === 'reserve_maya';
  const mostrarCampo = (campo: 'hours' | 'reservationHours' | 'prices') =>
    !reserveMaya || !!server[campo].trim() || !!form[campo].trim();
  const avisoReserveMaya = reserveMaya ? (
    <p className="text-xs text-amber-700 dark:text-amber-300">
      Já vem do Reserve Maya ou da base de conhecimento. Recomendamos deixar em branco: escrever aqui pode contradizer
      o sistema.
    </p>
  ) : null;

  // Seletor compacto (tipo abas). A bolinha verde marca o modo em uso.
  const seletorDeModo = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div role="radiogroup" aria-label="Como configurar a IA" className="inline-flex rounded-lg bg-muted p-1">
        {MODOS.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={modo === m.value}
            title={m.hint}
            onClick={() => setModoEscolhido(m.value)}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              modo === m.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <m.icon className="h-4 w-4 shrink-0" />
            {m.label}
            {emUso === m.value && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-label="em uso" />
            )}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {emUso ? (
          <>
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle" aria-hidden />
            Em uso. Só um modo vale de cada vez: salvar um substitui o texto do outro.
          </>
        ) : (
          'Nenhum texto salvo ainda: a IA usa um texto padrão curto.'
        )}
      </p>
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
            {reserveMaya &&
              ' Restaurante do Reserve Maya: horários, turnos, regras de reserva e preços já vêm do Reserve Maya e da base de conhecimento; não precisam estar neste texto.'}
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

          <Secao titulo="Como a IA se apresenta">
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

            <CampoTexto
              id="greeting"
              campo="greeting"
              rows={5}
              valor={form.greeting}
              onChange={(greeting) => set({ greeting })}
            />
          </Secao>

          <Secao titulo="A casa" separada>
            <div className="space-y-2">
              <Label htmlFor="address">Endereço</Label>
              <Input
                id="address"
                placeholder="Ex: Rua das Flores, 120, Setor Bueno, Goiânia"
                value={form.address}
                onChange={(e) => set({ address: e.target.value })}
              />
            </div>

            {mostrarCampo('hours') && (
              <div className="space-y-2">
                <Label htmlFor="hours">Horário de funcionamento</Label>
                <Textarea
                  id="hours"
                  rows={2}
                  placeholder="Ex: Seg a sex 11h-15h e 18h-23h. Sáb e dom 12h-23h."
                  value={form.hours}
                  onChange={(e) => set({ hours: e.target.value })}
                />
                {avisoReserveMaya}
              </div>
            )}

            {mostrarCampo('reservationHours') && (
              <div className="space-y-2">
                <Label htmlFor="reservation-hours">Horários para reserva</Label>
                <Input
                  id="reservation-hours"
                  placeholder="Ex: 19h às 22h, de terça a domingo"
                  value={form.reservationHours}
                  onChange={(e) => set({ reservationHours: e.target.value })}
                />
                {avisoReserveMaya ?? (
                  <p className="text-xs text-muted-foreground">
                    Preenchido, a IA fica proibida de oferecer reserva fora dessa janela. Em branco,
                    ela usa o horário de funcionamento como referência.
                  </p>
                )}
              </div>
            )}

            {mostrarCampo('prices') && (
              <div className="space-y-2">
                <Label htmlFor="prices">Preços</Label>
                <Textarea
                  id="prices"
                  rows={2}
                  placeholder="Ex: Pratos de R$ 45 a R$ 90. Couvert R$ 18. Taxa de serviço 10%."
                  value={form.prices}
                  onChange={(e) => set({ prices: e.target.value })}
                />
                {avisoReserveMaya}
              </div>
            )}

            <CampoTexto id="about" campo="about" rows={4} valor={form.about} onChange={(about) => set({ about })} />

            <CampoTexto
              id="links"
              campo="links"
              rows={3}
              valor={form.links}
              onChange={(links) => set({ links })}
              dica={
                reserveMaya
                  ? `${CAMPOS_TEXTO.links.paraQueServe} O link de reserva é opcional: com o Reserve Maya, a IA também reserva sozinha.`
                  : undefined
              }
            />
          </Secao>

          <Secao titulo="Regras" separada>
            <CampoTexto
              id="limitations"
              campo="limitations"
              rows={4}
              valor={form.limitations}
              onChange={(limitations) => set({ limitations })}
            />

            <CampoTexto
              id="instructions"
              campo="instructions"
              rows={3}
              valor={form.instructions}
              onChange={(instructions) => set({ instructions })}
              dica={
                reserveMaya
                  ? `${CAMPOS_TEXTO.instructions.paraQueServe} Só o que não está no Reserve Maya nem na base de conhecimento.`
                  : undefined
              }
            />
          </Secao>

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

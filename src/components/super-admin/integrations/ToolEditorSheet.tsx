'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { isValidToolName } from '@/lib/ai-tools/params';
import { cn } from '@/lib/utils';
import { AlertTriangle, Braces, CheckCircle2, ChevronDown, Info, Loader2, Save, Settings2, Wand2 } from 'lucide-react';
import { BodyBuilder } from './BodyBuilder';
import {
  builderProblems,
  emptyBuilder,
  methodSendsBody,
  parseBuilder,
  serializeBuilder,
  type BodyBuilderState,
} from './bodyBuilderModel';
import { useSaveTool } from './hooks';
import { ParamsEditor, paramRowProblem, type ParamRow } from './ParamsEditor';
import { actionFromRow, actionRowFrom, actionRowProblem, PostActionsEditor, type ActionRow } from './PostActionsEditor';
import { TemplateInput, TemplateTargetProvider, TemplateTextarea, VariablesHelper } from './TemplateFields';
import { ToolTestPanel } from './ToolTestPanel';
import { HTTP_METHODS, POST_ACTION_META, uid, type AdminIntegration, type AdminTool, type HttpMethod } from './types';

/**
 * Editor de ferramenta HTTP.
 *
 * Modo simples (padrao): o essencial, sem variaveis {{...}}; o corpo e
 * montado por partes (BodyBuilder). Modo avancado: todos os campos (corpo
 * JSON com variaveis, resposta personalizada, acoes no CRM, ordem).
 * Os dois salvam o mesmo formato; o que o modo simples nao sabe montar abre
 * direto no avancado, sem perder nada.
 */

interface ToolForm {
  name: string;
  /** Nome editado a mao (para de sugerir a partir do rotulo). */
  nameTouched: boolean;
  label: string;
  aiDescription: string;
  promptHint: string;
  params: ParamRow[];
  method: HttpMethod;
  path: string;
  /** Corpo do modo avancado (JSON com variaveis). */
  bodyText: string;
  /** Corpo do modo simples (montado por partes). */
  builder: BodyBuilderState;
  responseTemplate: string;
  actions: ActionRow[];
  isWrite: boolean;
  isActive: boolean;
  sortOrder: string;
}

type Mode = 'simple' | 'advanced';

interface Loaded {
  form: ToolForm;
  mode: Mode;
  /** Por que abriu no avancado (corpo que o modo simples nao monta). */
  advancedReason: string | null;
}

function paramKeysOf(rows: ParamRow[]): string[] {
  return rows.map((r) => r.key.trim()).filter(Boolean);
}

/** Abre a ferramenta. `keep` = modo atual (depois de salvar, nao troca de modo sozinho). */
function loadTool(tool: AdminTool | null, nextOrder: number, keep?: Mode): Loaded {
  if (!tool) {
    return {
      form: {
        name: '',
        nameTouched: false,
        label: '',
        aiDescription: '',
        promptHint: '',
        params: [],
        method: 'POST',
        path: '',
        bodyText: '',
        builder: emptyBuilder(),
        responseTemplate: '',
        actions: [],
        isWrite: false,
        isActive: true,
        sortOrder: String(nextOrder),
      },
      mode: keep ?? 'simple',
      advancedReason: null,
    };
  }
  const params: ParamRow[] = tool.parameters.map((p) => ({
    uid: uid(),
    key: p.key,
    type: p.type,
    description: p.description ?? '',
    required: p.required === true,
    options: (p.enum ?? []).join(', '),
  }));
  const method: HttpMethod = (HTTP_METHODS as readonly string[]).includes(tool.method) ? (tool.method as HttpMethod) : 'POST';
  const parsed = parseBuilder(tool.bodyTemplate, paramKeysOf(params), method);
  const form: ToolForm = {
    name: tool.name,
    nameTouched: true,
    label: tool.label,
    aiDescription: tool.aiDescription,
    promptHint: tool.promptHint ?? '',
    params,
    method,
    path: tool.path,
    bodyText: tool.bodyTemplate === null || tool.bodyTemplate === undefined ? '' : JSON.stringify(tool.bodyTemplate, null, 2),
    builder: parsed.ok ? parsed.builder : emptyBuilder(),
    responseTemplate: tool.responseTemplate ?? '',
    actions: tool.postActions.map(actionRowFrom),
    isWrite: tool.isWrite,
    isActive: tool.isActive,
    sortOrder: String(tool.sortOrder),
  };
  if (!parsed.ok) return { form, mode: 'advanced', advancedReason: parsed.reason };
  return { form, mode: keep ?? 'simple', advancedReason: null };
}

/** "Ver horários" -> "ver_horarios" */
function nameFromLabel(label: string): string {
  const base = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return /^[a-z]/.test(base) ? base : base ? `acao_${base}` : '';
}

type BodyCheck = { ok: true; value: unknown } | { ok: false; message: string };

function checkBody(text: string): BodyCheck {
  if (!text.trim()) return { ok: true, value: null };
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object') return { ok: false, message: 'O corpo precisa ser um objeto {...} ou uma lista [...]' };
    return { ok: true, value };
  } catch (e) {
    return { ok: false, message: `JSON inválido: ${e instanceof Error ? e.message : 'verifique vírgulas e aspas'}` };
  }
}

/** Corpo que sera salvo no modo atual. */
function effectiveBody(form: ToolForm, mode: Mode): BodyCheck {
  if (mode === 'simple') {
    return { ok: true, value: serializeBuilder(form.builder, paramKeysOf(form.params), form.method) };
  }
  return checkBody(form.bodyText);
}

/** Mesmo formato de sempre pro useSaveTool, nos dois modos. */
function buildPayload(form: ToolForm, mode: Mode): Record<string, unknown> {
  const body = effectiveBody(form, mode);
  return {
    name: form.name.trim(),
    label: form.label.trim(),
    aiDescription: form.aiDescription.trim(),
    promptHint: form.promptHint.trim() || null,
    parameters: form.params.map((r) => ({
      key: r.key.trim(),
      type: r.type,
      description: r.description.trim(),
      required: r.required,
      ...(r.type === 'string'
        ? {
            enum: r.options
              .split(',')
              .map((o) => o.trim())
              .filter(Boolean),
          }
        : {}),
    })),
    method: form.method,
    path: form.path.trim(),
    bodyTemplate: body.ok ? body.value : null,
    responseTemplate: form.responseTemplate.trim() ? form.responseTemplate : null,
    postActions: form.actions.map(actionFromRow),
    isWrite: form.isWrite,
    isActive: form.isActive,
    sortOrder: Math.max(0, Number.parseInt(form.sortOrder, 10) || 0),
  };
}

/** "Tem alteracao?" compara o que seria salvo (trocar de modo nao conta). */
function snapshot(form: ToolForm, mode: Mode): string {
  const body = effectiveBody(form, mode);
  return JSON.stringify([buildPayload(form, mode), body.ok ? null : form.bodyText]);
}

function pathProblem(path: string): string | null {
  const p = path.trim();
  if (!p) return null;
  if (!p.startsWith('/')) return 'Comece com "/" (ex: /reservations-api)';
  if (p.includes('://')) return 'Use só o caminho; a base da URL fica na integração';
  return null;
}

const METHOD_HINT: Record<HttpMethod, string> = {
  GET: 'buscar',
  POST: 'enviar dados',
  PUT: 'substituir',
  PATCH: 'alterar',
  DELETE: 'apagar',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration: AdminIntegration;
  /** Versao salva (null = nova ferramenta). */
  tool: AdminTool | null;
  reservedNames: string[];
  /** Nomes de outras ferramentas do sistema -> integracao (unicidade). */
  otherToolNames: Map<string, string>;
  onSaved: (tool: AdminTool) => void;
}

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-border/40 bg-card/60 p-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Help({ children }: { children: ReactNode }) {
  return <p className="text-[11px] text-muted-foreground">{children}</p>;
}

function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const items: { value: Mode; label: string }[] = [
    { value: 'simple', label: 'Simples' },
    { value: 'advanced', label: 'Avançado' },
  ];
  return (
    <div role="radiogroup" aria-label="Modo de edição" className="inline-flex shrink-0 rounded-lg border border-border/60 bg-muted/40 p-0.5">
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          role="radio"
          aria-checked={mode === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            mode === it.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** Resumo de algo configurado so no modo avancado (nao esconde em silencio). */
function AdvancedSummary({ children, onOpen, extra }: { children: ReactNode; onOpen: () => void; extra?: ReactNode }) {
  return (
    <div className="space-y-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3">
      <div className="flex items-start gap-2 text-xs">
        <Settings2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 space-y-0.5">{children}</div>
      </div>
      <div className="flex flex-wrap gap-2 pl-6">
        <Button type="button" variant="outline" size="sm" onClick={onOpen}>
          Editar no modo avançado
        </Button>
        {extra}
      </div>
    </div>
  );
}

export function ToolEditorSheet({ open, onOpenChange, integration, tool, reservedNames, otherToolNames, onSaved }: Props) {
  const { toast } = useToast();
  const saveTool = useSaveTool(integration.id);
  const [start] = useState<Loaded>(() => loadTool(tool, integration.tools.length));
  const [form, setForm] = useState<ToolForm>(start.form);
  const [mode, setMode] = useState<Mode>(start.mode);
  const [advancedReason, setAdvancedReason] = useState<string | null>(start.advancedReason);
  /** Motivo de nao ter conseguido voltar ao modo simples. */
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string>(() => snapshot(start.form, start.mode));
  const [tab, setTab] = useState<'config' | 'test'>('config');
  const [helperOpen, setHelperOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768);
  const [discardOpen, setDiscardOpen] = useState(false);

  const set = <K extends keyof ToolForm>(key: K, value: ToolForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const currentKey = useMemo(() => snapshot(form, mode), [form, mode]);
  const dirty = currentKey !== savedKey;
  const isNew = !tool;
  const simple = mode === 'simple';
  const sendsBody = methodSendsBody(form.method);

  // ─── Validacao ao vivo ───
  const name = form.name.trim();
  const nameProblem = !name
    ? 'Informe o nome'
    : !isValidToolName(name)
      ? 'Use snake_case: minúsculas, números e _, começando com letra (2 a 64)'
      : reservedNames.includes(name)
        ? 'Nome reservado de uma ferramenta nativa do CRM'
        : otherToolNames.has(name)
          ? `Já usado na integração ${otherToolNames.get(name)}`
          : null;
  const paramKeys = paramKeysOf(form.params);
  const body = effectiveBody(form, mode);
  const bodyProblems = simple ? builderProblems(form.builder, paramKeys, form.method) : [];
  const pathError = pathProblem(form.path);
  const paramErrors = form.params.map((r) => paramRowProblem(r, form.params)).filter(Boolean);
  const actionErrors = form.actions.map(actionRowProblem).filter((p) => p?.level === 'error');
  const renamed = !!tool && name !== tool.name;

  const blocking: string[] = [
    !form.label.trim() ? 'Informe o nome que o restaurante vê' : '',
    nameProblem ? `${simple ? 'Nome técnico' : 'Nome para a IA'}: ${nameProblem}` : '',
    !form.aiDescription.trim() ? 'Explique quando a IA deve usar a ferramenta' : '',
    paramErrors.length ? 'Corrija o que a IA pergunta ao cliente (itens marcados)' : '',
    pathError ? `Endereço: ${pathError}` : '',
    !body.ok ? `Corpo: ${body.message}` : '',
    bodyProblems.length ? `O que enviar: ${bodyProblems[0]}` : '',
    actionErrors.length ? (simple ? 'Corrija as ações no CRM (no modo avançado)' : 'Corrija as ações no CRM marcadas') : '',
  ].filter(Boolean);

  const configKeys = integration.configFields.map((f) => f.key);

  const handleOpenChange = (next: boolean) => {
    if (!next && dirty) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(next);
  };

  // ─── Troca de modo ───
  const goAdvanced = () => {
    if (mode === 'advanced') return;
    // O que o modo simples montou vira o JSON (pra ajustar a mao).
    const value = serializeBuilder(form.builder, paramKeys, form.method);
    setForm((f) => ({ ...f, bodyText: value === null ? '' : JSON.stringify(value, null, 2) }));
    setMode('advanced');
    setAdvancedReason(null);
    setSwitchError(null);
  };

  const goSimple = () => {
    if (mode === 'simple') return;
    const current = checkBody(form.bodyText);
    if (!current.ok) {
      setSwitchError(`O corpo (JSON) tem um erro: ${current.message}.`);
      return;
    }
    const parsed = parseBuilder(current.value, paramKeys, form.method);
    if (!parsed.ok) {
      setSwitchError(parsed.reason);
      return;
    }
    setForm((f) => ({ ...f, builder: parsed.builder }));
    setMode('simple');
    setAdvancedReason(null);
    setSwitchError(null);
  };

  const generateBody = () => {
    const current = checkBody(form.bodyText);
    const base: Record<string, unknown> =
      current.ok && current.value && typeof current.value === 'object' && !Array.isArray(current.value)
        ? { ...(current.value as Record<string, unknown>) }
        : {};
    if (!current.ok) {
      toast({ title: 'Corrija o JSON antes', description: current.message, variant: 'destructive' });
      return;
    }
    for (const key of paramKeys) if (!(key in base)) base[key] = `{{args.${key}}}`;
    set('bodyText', JSON.stringify(base, null, 2));
    setSwitchError(null);
  };

  const save = async () => {
    if (blocking.length) {
      toast({ title: 'Revise a ferramenta', description: blocking[0], variant: 'destructive' });
      return;
    }
    try {
      const saved = await saveTool.mutateAsync({ toolId: tool?.id, payload: buildPayload(form, mode) });
      const next = loadTool(saved, 0, mode);
      setForm(next.form);
      setMode(next.mode);
      setAdvancedReason(next.advancedReason);
      setSwitchError(null);
      setSavedKey(snapshot(next.form, next.mode));
      onSaved(saved);
      toast({
        title: isNew ? 'Ferramenta criada' : 'Ferramenta salva',
        description: isNew ? 'Use a aba Testar para conferir a chamada.' : undefined,
      });
    } catch (e) {
      toast({ title: 'Erro ao salvar', description: e instanceof Error ? e.message : 'Tente novamente', variant: 'destructive' });
    }
  };

  const pathField = simple ? (
    <Input
      id="tool-path"
      value={form.path}
      onChange={(e) => set('path', e.target.value)}
      placeholder="/reservations-api"
      aria-invalid={!!pathError}
      spellCheck={false}
      className="rounded-none border-0 font-mono focus-visible:ring-0 focus-visible:ring-offset-0"
    />
  ) : (
    <TemplateInput
      id="tool-path"
      value={form.path}
      onValueChange={(v) => set('path', v)}
      fieldLabel="Endereço"
      placeholder="/reservations-api"
      aria-invalid={!!pathError}
      className="rounded-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
    />
  );

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl">
        <SheetHeader className="border-b border-border/40 px-4 py-4 pr-12 text-left sm:px-6">
          <SheetTitle className="truncate">{isNew ? 'Nova ferramenta' : tool.label}</SheetTitle>
          <SheetDescription className="truncate">
            {integration.icon ? `${integration.icon} ` : ''}
            {integration.name}
            {!isNew && <span className="ml-2 font-mono text-xs">{tool.name}</span>}
          </SheetDescription>
        </SheetHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v === 'test' ? 'test' : 'config')} className="flex min-h-0 flex-1 flex-col">
          <div className="px-4 pt-3 sm:px-6">
            <TabsList>
              <TabsTrigger value="config">Configurar</TabsTrigger>
              <TabsTrigger value="test">Testar</TabsTrigger>
            </TabsList>
          </div>

          {/* forceMount + hidden: trocar de aba nao perde o teste nem o foco do painel de variaveis. */}
          <TabsContent
            value="config"
            forceMount
            className="mt-0 min-h-0 flex-1 overflow-y-auto px-4 pb-6 data-[state=inactive]:hidden sm:px-6"
          >
            <TemplateTargetProvider>
              {/* Simples x Avancado */}
              <div className="space-y-2 pt-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <ModeSwitch mode={mode} onChange={(m) => (m === 'simple' ? goSimple() : goAdvanced())} />
                  <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                    {simple
                      ? 'O essencial, sem variáveis. Para tudo o que existe, use o modo avançado.'
                      : 'Todas as opções: corpo JSON com variáveis, resposta personalizada, ações no CRM e ordem.'}
                  </p>
                </div>
                {switchError ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      <span className="font-medium">Não dá para voltar ao modo simples.</span> {switchError} Ajuste o
                      corpo abaixo ou continue no modo avançado.
                    </AlertDescription>
                  </Alert>
                ) : (
                  !simple &&
                  advancedReason && (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        <span className="font-medium">Esta ferramenta usa opções avançadas.</span> {advancedReason}
                      </AlertDescription>
                    </Alert>
                  )
                )}
              </div>

              {/* Variaveis: so no modo avancado, sempre a mao enquanto rola o formulario. */}
              {!simple && (
                <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 pb-2 pt-3 backdrop-blur sm:-mx-6 sm:px-6">
                  <button
                    type="button"
                    onClick={() => setHelperOpen((v) => !v)}
                    className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-sm font-medium text-primary"
                  >
                    <Braces className="h-4 w-4" />
                    Variáveis disponíveis
                    <ChevronDown className={cn('ml-auto h-4 w-4 transition-transform', helperOpen && 'rotate-180')} />
                  </button>
                  {helperOpen && (
                    <VariablesHelper paramKeys={paramKeys} configKeys={configKeys} className="mt-1 max-h-[35vh] overflow-y-auto" />
                  )}
                </div>
              )}

              <div className="space-y-4 pt-3">
                {/* ─── O que a ferramenta faz ─── */}
                <Section title="O que a ferramenta faz">
                  <div className={cn('grid grid-cols-1 gap-3', !simple && 'sm:grid-cols-2')}>
                    <div className="space-y-1.5">
                      <Label htmlFor="tool-label">Nome que o restaurante vê</Label>
                      <Input
                        id="tool-label"
                        value={form.label}
                        onChange={(e) => {
                          const label = e.target.value;
                          setForm((f) => ({ ...f, label, name: f.nameTouched ? f.name : nameFromLabel(label) }));
                        }}
                        placeholder="ex: Fazer reservas"
                      />
                      {simple ? (
                        <>
                          <Help>
                            Aparece na lista de ferramentas do restaurante. Nome técnico
                            {form.nameTouched ? '' : ' (automático)'}:{' '}
                            <span className="break-all font-mono text-foreground">{name || '...'}</span>
                          </Help>
                          {nameProblem && (name || form.label.trim()) && (
                            <p className="text-[11px] text-destructive">
                              Nome técnico: {nameProblem}.{' '}
                              {form.nameTouched ? (
                                <button type="button" onClick={goAdvanced} className="font-medium underline">
                                  Ajustar no modo avançado
                                </button>
                              ) : (
                                'Mude o nome acima.'
                              )}
                            </p>
                          )}
                        </>
                      ) : (
                        <Help>Aparece na lista de ferramentas do restaurante.</Help>
                      )}
                    </div>
                    {!simple && (
                      <div className="space-y-1.5">
                        <Label htmlFor="tool-name">Nome para a IA</Label>
                        <Input
                          id="tool-name"
                          value={form.name}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, name: e.target.value.toLowerCase().replace(/[\s-]/g, '_'), nameTouched: true }))
                          }
                          placeholder="ex: criar_reserva"
                          className="font-mono"
                          aria-invalid={!!nameProblem}
                          spellCheck={false}
                        />
                        {nameProblem ? (
                          <p className="text-[11px] text-destructive">{nameProblem}</p>
                        ) : (
                          <Help>snake_case, único em todo o sistema</Help>
                        )}
                      </div>
                    )}
                  </div>
                  {renamed && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Ao salvar, os restaurantes que usam <span className="font-mono">{tool.name}</span> passam a usar{' '}
                        <span className="font-mono">{name}</span> automaticamente. Se algum fluxo do orquestrador
                        (n8n/Maestro) cita o nome antigo, atualize lá também.
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="tool-ai-description">Quando a IA deve usar</Label>
                    <Textarea
                      id="tool-ai-description"
                      value={form.aiDescription}
                      onChange={(e) => set('aiDescription', e.target.value)}
                      rows={3}
                      placeholder="ex: Use quando o cliente quiser saber se tem mesa livre. Confere a disponibilidade para a data, o horário e o número de pessoas. Use antes de fazer a reserva."
                    />
                    <Help>
                      Explique como para um atendente novo: o que a ferramenta faz e em que momento usar. É isso que a IA
                      lê para decidir.
                    </Help>
                  </div>
                  {!simple ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="tool-prompt-hint">Dica no prompt (opcional)</Label>
                      <Input
                        id="tool-prompt-hint"
                        value={form.promptHint}
                        onChange={(e) => set('promptHint', e.target.value)}
                        placeholder="ex: antes de reservar, verifique a disponibilidade"
                      />
                      <Help>Somada ao prompt do agente quando a ferramenta está ligada no restaurante.</Help>
                    </div>
                  ) : (
                    form.promptHint.trim() && (
                      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                        <Settings2 className="mt-px h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="min-w-0">
                          Dica no prompt (configurada no modo avançado):{' '}
                          <span className="break-words text-foreground">“{form.promptHint.trim()}”</span>
                        </span>
                      </p>
                    )
                  )}
                </Section>

                {/* ─── O que a IA pergunta ─── */}
                <Section
                  title="O que a IA pergunta ao cliente"
                  description="Cada item é um dado que a IA pede ao cliente antes de usar a ferramenta (ex: data, horário, número de pessoas). O CRM confere o formato antes de enviar."
                >
                  <ParamsEditor rows={form.params} onChange={(rows) => set('params', rows)} />
                </Section>

                {/* ─── Para onde enviar ─── */}
                <Section title="Para onde enviar" description="Veja na documentação do sistema. Na dúvida, use POST.">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr]">
                    <div className="space-y-1.5">
                      <Label>Método</Label>
                      <Select value={form.method} onValueChange={(v) => set('method', v as HttpMethod)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {HTTP_METHODS.map((m) => (
                            <SelectItem key={m} value={m}>
                              {m} · {METHOD_HINT[m]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      <Label htmlFor="tool-path">Endereço</Label>
                      <div
                        className={cn(
                          'overflow-hidden rounded-md border ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
                          pathError ? 'border-destructive' : 'border-input'
                        )}
                      >
                        <div
                          className="break-all border-b border-inherit bg-muted/50 px-3 py-1.5 font-mono text-[11px] text-muted-foreground"
                          title="Começo do endereço: vem da integração"
                        >
                          {integration.baseUrl || 'sem endereço base na integração'}
                        </div>
                        {pathField}
                      </div>
                      {pathError ? (
                        <p className="text-[11px] text-destructive">{pathError}</p>
                      ) : (
                        <Help>O começo vem da integração; complete só o final, começando com &quot;/&quot;.</Help>
                      )}
                    </div>
                  </div>
                  {simple && !sendsBody && (
                    <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                      <Info className="mt-px h-3.5 w-3.5 shrink-0" />
                      Com {form.method} nada é enviado no corpo, só o endereço. Se o sistema precisa receber o que o
                      cliente disse, use POST.
                    </p>
                  )}
                </Section>

                {/* ─── O que enviar ─── */}
                {simple ? (
                  sendsBody && (
                    <Section title="O que enviar" description="Monte o que vai para o sistema. Não precisa escrever código.">
                      <BodyBuilder
                        value={form.builder}
                        onChange={(builder) => set('builder', builder)}
                        params={form.params
                          .filter((p) => p.key.trim())
                          .map((p) => ({ id: p.uid, key: p.key.trim(), description: p.description }))}
                      />
                    </Section>
                  )
                ) : (
                  <Section title="O que enviar" description="Corpo da chamada em JSON, com variáveis.">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label>Corpo (JSON)</Label>
                        <Button type="button" variant="ghost" size="sm" onClick={generateBody} disabled={!paramKeys.length}>
                          <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                          Incluir parâmetros
                        </Button>
                      </div>
                      <TemplateTextarea
                        value={form.bodyText}
                        onValueChange={(v) => {
                          set('bodyText', v);
                          setSwitchError(null);
                        }}
                        fieldLabel="Corpo (JSON)"
                        rows={10}
                        placeholder={'{\n  "action": "create_reservation",\n  "restaurant_id": "{{inbox.restaurant_id}}",\n  "date": "{{args.date}}"\n}'}
                        aria-invalid={!body.ok}
                      />
                      {!body.ok ? (
                        <p className="text-[11px] text-destructive">{body.message}</p>
                      ) : (
                        <Help>
                          {form.bodyText.trim() ? 'JSON válido. ' : 'Vazio = sem corpo. '}
                          {!sendsBody && form.bodyText.trim() ? `Atenção: ${form.method} não envia corpo. ` : ''}
                          Coloque as variáveis entre aspas: <span className="font-mono">{'"{{args.people}}"'}</span> vira
                          número se o valor for número.
                        </Help>
                      )}
                    </div>
                  </Section>
                )}

                {/* ─── Resposta para a IA ─── */}
                <Section title="Resposta para a IA">
                  {simple ? (
                    form.responseTemplate.trim() ? (
                      <AdvancedSummary
                        onOpen={goAdvanced}
                        extra={
                          <Button type="button" variant="ghost" size="sm" onClick={() => set('responseTemplate', '')}>
                            Mandar a resposta inteira
                          </Button>
                        }
                      >
                        <p className="font-medium">Configurado no modo avançado</p>
                        <p className="text-muted-foreground">A IA recebe um texto montado com partes da resposta do sistema.</p>
                      </AdvancedSummary>
                    ) : (
                      <div className="flex items-start gap-2 rounded-xl border border-border/50 bg-muted/30 p-3">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">Mandar a resposta do sistema inteira para a IA</p>
                          <Help>
                            A IA lê o que o sistema respondeu e explica ao cliente. Para escolher só uma parte da resposta,
                            use o modo avançado.
                          </Help>
                        </div>
                      </div>
                    )
                  ) : (
                    <>
                      <Help>Texto que a IA recebe quando dá certo. Vazio = o JSON da resposta (até 3000 caracteres).</Help>
                      <TemplateTextarea
                        value={form.responseTemplate}
                        onValueChange={(v) => set('responseTemplate', v)}
                        fieldLabel="Resposta para a IA"
                        allowResposta
                        rows={3}
                        placeholder="ex: Reserva {{resposta.status}}. Link para o cliente: {{resposta.management_url}}"
                      />
                    </>
                  )}
                  <Help>
                    {simple ? (
                      'Se o sistema recusar o pedido, a IA avisa o cliente e não diz que deu certo.'
                    ) : (
                      <>
                        Se o sistema responder com <span className="font-mono">success: false</span> ou{' '}
                        <span className="font-mono">ok: false</span>, a IA recebe a recusa e não diz que a ação foi feita.
                      </>
                    )}
                  </Help>
                </Section>

                {/* ─── Acoes no CRM ─── */}
                {!simple ? (
                  <Section
                    title="Ações no CRM depois do sucesso"
                    description="Ligam a integração ao resto do CRM (reserva no dashboard, etiqueta...). Não rodam no teste."
                  >
                    <PostActionsEditor rows={form.actions} onChange={(rows) => set('actions', rows)} />
                  </Section>
                ) : (
                  form.actions.length > 0 && (
                    <Section title="Ações no CRM depois do sucesso">
                      <AdvancedSummary onOpen={goAdvanced}>
                        <p className="font-medium">Configurado no modo avançado</p>
                        <p className="text-muted-foreground">
                          Quando dá certo, o CRM também faz:{' '}
                          {form.actions.map((a) => POST_ACTION_META[a.type].label).join(', ')}.
                        </p>
                        {actionErrors.length > 0 && (
                          <p className="text-destructive">Tem ação com informação faltando: corrija no modo avançado.</p>
                        )}
                      </AdvancedSummary>
                    </Section>
                  )
                )}

                {/* ─── Comportamento ─── */}
                <Section title="Comportamento">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Label htmlFor="tool-is-write">Altera dados (a IA confirma com o cliente antes)</Label>
                      <p className="text-xs text-muted-foreground">
                        Ligue quando a ferramenta cria, muda ou cancela algo (ex: fazer ou cancelar reserva). A IA confirma
                        com o cliente antes de usar, e o mesmo pedido repetido em até 2 minutos não é feito de novo.
                      </p>
                    </div>
                    <Switch id="tool-is-write" checked={form.isWrite} onCheckedChange={(v) => set('isWrite', v)} />
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Label htmlFor="tool-is-active">Ativa</Label>
                      <p className="text-xs text-muted-foreground">Desligada, some para todos os restaurantes.</p>
                    </div>
                    <Switch id="tool-is-active" checked={form.isActive} onCheckedChange={(v) => set('isActive', v)} />
                  </div>
                  {!simple && (
                    <div className="flex items-center justify-between gap-4">
                      <Label htmlFor="tool-order">Ordem na lista</Label>
                      <Input
                        id="tool-order"
                        type="number"
                        min={0}
                        value={form.sortOrder}
                        onChange={(e) => set('sortOrder', e.target.value)}
                        className="w-24"
                      />
                    </div>
                  )}
                </Section>
              </div>
            </TemplateTargetProvider>
          </TabsContent>

          <TabsContent
            value="test"
            forceMount
            className="mt-0 min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4 data-[state=inactive]:hidden sm:px-6"
          >
            {tool ? (
              <ToolTestPanel
                key={`${tool.id}:${JSON.stringify(tool.parameters)}`}
                integration={integration}
                tool={tool}
                dirty={dirty}
              />
            ) : (
              <p className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                Salve a ferramenta para poder testar.
              </p>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex flex-col-reverse gap-2 border-t border-border/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          {dirty && <p className="text-xs text-muted-foreground sm:mr-auto">Alterações não salvas</p>}
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Fechar
          </Button>
          <Button type="button" onClick={save} disabled={saveTool.isPending || (!dirty && !isNew)}>
            {saveTool.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {isNew ? 'Criar ferramenta' : 'Salvar'}
          </Button>
        </div>

        <ConfirmDialog
          open={discardOpen}
          onOpenChange={setDiscardOpen}
          title="Descartar alterações?"
          description="As mudanças nesta ferramenta ainda não foram salvas."
          confirmLabel="Descartar"
          variant="destructive"
          onConfirm={() => {
            setDiscardOpen(false);
            onOpenChange(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

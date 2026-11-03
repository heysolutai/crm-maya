'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  KeyRound,
  ListChecks,
  Loader2,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Trash2,
  Wand2,
  Wrench,
} from 'lucide-react';
import { configFieldsPayload, ConfigFieldsEditor, configRowProblem, configRowsFrom, type ConfigFieldRow } from './ConfigFieldsEditor';
import { FailuresPanel } from './FailuresPanel';
import { McpToolRow } from './McpToolRow';
import { HeadersEditor, headerRowProblem, headerRowsFrom, headersPayload, type HeaderRow } from './HeadersEditor';
import { useAdminIntegrations, useDeleteIntegration, useDeleteTool, useSaveIntegration, useSyncMcp } from './hooks';
import { ToolEditorSheet } from './ToolEditorSheet';
import {
  isHttpsUrl,
  sampleArgs,
  SEGMENT_OPTIONS,
  slugify,
  SLUG_RE,
  type AdminIntegration,
  type AdminTool,
} from './types';

const ALL = '__todos__';
const CUSTOM = '__personalizado__';
const NONE = '__nenhuma__';

/** Texto obrigatório sem lista de opções (código da reserva, nome...): só existe numa conversa, o teste não tem. */
function pedeDadoDoCliente(params: AdminTool['parameters']): boolean {
  return params.some((p) => p.required && p.type === 'string' && !p.enum?.length);
}

interface IntegrationForm {
  name: string;
  slug: string;
  /** Slug editado a mao (para de seguir o nome). */
  slugTouched: boolean;
  icon: string;
  segment: string;
  segmentCustom: boolean;
  description: string;
  /** 'http' = ferramentas montadas aqui; 'mcp' = servidor MCP. */
  kind: 'http' | 'mcp';
  baseUrl: string;
  isActive: boolean;
  headers: HeaderRow[];
  configFields: ConfigFieldRow[];
  testToolName: string;
  testArgsText: string;
}

function emptyForm(): IntegrationForm {
  return {
    name: '',
    slug: '',
    slugTouched: false,
    icon: '🔌',
    segment: '',
    segmentCustom: false,
    description: '',
    kind: 'http',
    baseUrl: 'https://',
    isActive: true,
    headers: [],
    configFields: [],
    testToolName: '',
    testArgsText: '',
  };
}

function formFrom(i: AdminIntegration): IntegrationForm {
  const segment = i.segment ?? '';
  return {
    name: i.name,
    slug: i.slug,
    slugTouched: true,
    icon: i.icon ?? '',
    segment,
    segmentCustom: !!segment && !SEGMENT_OPTIONS.some((o) => o.value === segment),
    description: i.description ?? '',
    kind: i.kind === 'mcp' ? 'mcp' : 'http',
    baseUrl: i.baseUrl,
    isActive: i.isActive,
    headers: headerRowsFrom(i.headers),
    configFields: configRowsFrom(i.configFields),
    testToolName: i.testToolName ?? '',
    testArgsText: i.testArgs ? JSON.stringify(i.testArgs, null, 2) : '',
  };
}

type ArgsCheck = { ok: true; value: Record<string, unknown> | null } | { ok: false; message: string };

function checkTestArgs(text: string): ArgsCheck {
  if (!text.trim()) return { ok: true, value: null };
  try {
    const v: unknown = JSON.parse(text);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, message: 'Use um objeto JSON: { "chave": valor }' };
    return { ok: true, value: v as Record<string, unknown> };
  } catch (e) {
    return { ok: false, message: `JSON inválido: ${e instanceof Error ? e.message : 'verifique vírgulas e aspas'}` };
  }
}

function Panel({
  icon,
  title,
  description,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/40 bg-card/60 p-4 backdrop-blur-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
          <div className="min-w-0">
            <h2 className="font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

interface EditorState {
  open: boolean;
  /** Muda a cada abertura: o formulario da ferramenta comeca do zero. */
  session: number;
  toolId: string | null;
  snapshot: AdminTool | null;
}

export default function IntegrationEditor() {
  const { id } = useParams() as { id: string };
  const isNew = id === 'new';
  const router = useRouter();
  const { toast } = useToast();
  const { data, isLoading, error } = useAdminIntegrations();
  const saveIntegration = useSaveIntegration();
  const deleteIntegration = useDeleteIntegration();
  const deleteTool = useDeleteTool(isNew ? '' : id);

  const integration = isNew ? null : (data?.integrations.find((i) => i.id === id) ?? null);
  const reservedNames = data?.reservedNames ?? [];

  const [form, setForm] = useState<IntegrationForm>(emptyForm);
  const [initial, setInitial] = useState<IntegrationForm>(emptyForm);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toolToDelete, setToolToDelete] = useState<AdminTool | null>(null);
  const [editor, setEditor] = useState<EditorState>({ open: false, session: 0, toolId: null, snapshot: null });

  // Carrega o formulario uma vez por integracao: refetch (ex: depois de salvar
  // uma ferramenta) nao apaga o que esta sendo editado.
  useEffect(() => {
    if (isNew) {
      if (loadedFor !== 'new') {
        const f = emptyForm();
        setForm(f);
        setInitial(f);
        setLoadedFor('new');
      }
      return;
    }
    if (integration && loadedFor !== integration.id) {
      const f = formFrom(integration);
      setForm(f);
      setInitial(f);
      setLoadedFor(integration.id);
    }
  }, [isNew, integration, loadedFor]);

  const set = <K extends keyof IntegrationForm>(key: K, value: IntegrationForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial), [form, initial]);

  const tools = useMemo(
    () => [...(integration?.tools ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [integration]
  );
  // Tipo so muda sem ferramentas: as de API e as do MCP nao se misturam.
  const podeTrocarTipo = isNew || tools.length === 0;
  const ehMcp = !isNew && integration?.kind === 'mcp';
  const syncMcp = useSyncMcp(isNew ? '' : id);

  const buscarFerramentas = async () => {
    try {
      const r = await syncMcp.mutateAsync();
      const { total, novas, atualizadas, desativadas } = r.resumo;
      toast({
        title: `${total} ${total === 1 ? 'ferramenta encontrada' : 'ferramentas encontradas'} no servidor`,
        description: `${novas} novas · ${atualizadas} atualizadas${desativadas ? ` · ${desativadas} desativadas (sumiram do servidor)` : ''}`,
      });
    } catch (e) {
      toast({ title: 'Erro ao buscar', description: e instanceof Error ? e.message : 'Tente novamente', variant: 'destructive' });
    }
  };

  // Ferramenta aberta no editor: a versao do cache, ou a recem-salva enquanto o refetch nao chega.
  const editingTool = editor.toolId ? (tools.find((t) => t.id === editor.toolId) ?? editor.snapshot) : null;

  const otherToolNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of data?.integrations ?? []) {
      for (const t of i.tools) if (t.id !== editor.toolId) map.set(t.name, i.name);
    }
    return map;
  }, [data, editor.toolId]);

  // ─── Validacao ───
  const slugProblem = !SLUG_RE.test(form.slug) ? 'De 2 a 40 caracteres: letras minúsculas, números ou hífen' : null;
  const slugTaken = data?.integrations.some((i) => i.slug === form.slug && i.id !== id);
  const urlProblem = !isHttpsUrl(form.baseUrl.trim()) ? 'Use uma URL https completa' : null;
  const testArgs = checkTestArgs(form.testArgsText);
  const testTool = tools.find((t) => t.name === form.testToolName) ?? null;

  const problems: string[] = [
    !form.name.trim() ? 'Informe o nome da integração' : '',
    slugProblem ? `Identificador: ${slugProblem}` : '',
    slugTaken ? 'Já existe uma integração com esse identificador' : '',
    urlProblem ? `URL base: ${urlProblem}` : '',
    form.headers.some((r) => headerRowProblem(r, form.headers)) ? 'Corrija os cabeçalhos marcados' : '',
    form.configFields.some((r) => configRowProblem(r, form.configFields)) ? 'Corrija os campos do restaurante marcados' : '',
    !testArgs.ok ? `Argumentos de teste: ${testArgs.message}` : '',
  ].filter(Boolean);

  const handleSave = async () => {
    if (problems.length) {
      toast({ title: 'Revise a integração', description: problems[0], variant: 'destructive' });
      return;
    }
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      slug: form.slug,
      icon: form.icon.trim() || null,
      segment: form.segment.trim() || null,
      description: form.description.trim() || null,
      kind: form.kind,
      baseUrl: form.baseUrl.trim(),
      isActive: form.isActive,
      headers: headersPayload(form.headers),
      configFields: configFieldsPayload(form.configFields),
      testArgs: testArgs.ok ? testArgs.value : null,
      ...(isNew ? {} : { testToolName: form.testToolName || null }),
    };
    try {
      const saved = await saveIntegration.mutateAsync({ id: isNew ? undefined : id, payload });
      const f = formFrom(saved);
      setForm(f);
      setInitial(f);
      setLoadedFor(saved.id);
      if (isNew) {
        toast({ title: 'Integração criada', description: 'Agora adicione as ferramentas.' });
        router.replace(`/super-admin/integrations/${saved.id}`);
      } else {
        toast({ title: 'Integração salva' });
      }
    } catch (e) {
      toast({ title: 'Erro ao salvar', description: e instanceof Error ? e.message : 'Tente novamente', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!integration) return;
    try {
      await deleteIntegration.mutateAsync(integration.id);
      toast({ title: 'Integração excluída' });
      router.push('/super-admin/integrations');
    } catch (e) {
      toast({ title: 'Erro ao excluir', description: e instanceof Error ? e.message : 'Tente novamente', variant: 'destructive' });
    }
  };

  const handleDeleteTool = async () => {
    if (!toolToDelete) return;
    try {
      await deleteTool.mutateAsync(toolToDelete.id);
      // A ferramenta de teste apagada sai do formulario tambem (o servidor ja limpou).
      if (form.testToolName === toolToDelete.name) {
        setForm((f) => ({ ...f, testToolName: '' }));
        setInitial((f) => ({ ...f, testToolName: '' }));
      }
      toast({ title: 'Ferramenta excluída' });
    } catch (e) {
      toast({ title: 'Erro ao excluir', description: e instanceof Error ? e.message : 'Tente novamente', variant: 'destructive' });
    } finally {
      setToolToDelete(null);
    }
  };

  const openTool = (tool: AdminTool | null) =>
    setEditor((s) => ({ open: true, session: s.session + 1, toolId: tool?.id ?? null, snapshot: tool }));

  const handleToolSaved = (saved: AdminTool) => {
    const previous = editingTool;
    setEditor((s) => ({ ...s, toolId: saved.id, snapshot: saved }));
    // Renomeou a ferramenta de teste: o servidor ja atualizou, o formulario acompanha.
    if (previous && previous.name !== saved.name && form.testToolName === previous.name) {
      setForm((f) => ({ ...f, testToolName: saved.name }));
      setInitial((f) => ({ ...f, testToolName: saved.name }));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || (!isNew && !integration)) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <Plug className="h-12 w-12 text-muted-foreground" />
        <div>
          <h2 className="text-xl font-bold">{error ? 'Não foi possível carregar' : 'Integração não encontrada'}</h2>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'Ela pode ter sido excluída.'}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/super-admin/integrations">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para Integrações
          </Link>
        </Button>
      </div>
    );
  }

  const segmentMode = form.segmentCustom ? CUSTOM : form.segment || ALL;

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-24">
      {/* Cabecalho */}
      <div className="space-y-3">
        <Link
          href="/super-admin/integrations"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Integrações da IA
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-muted text-2xl">
              {form.icon || '🔌'}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold">{isNew ? 'Nova integração' : form.name || integration?.name}</h1>
              {!isNew && integration && (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={integration.isActive ? 'default' : 'secondary'}>
                    {integration.isActive ? 'Ativa' : 'Inativa'}
                  </Badge>
                  <span>
                    {integration.companiesUsing} {integration.companiesUsing === 1 ? 'restaurante usando' : 'restaurantes usando'}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!isNew && (
              <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </Button>
            )}
            <Button onClick={handleSave} disabled={saveIntegration.isPending || (!dirty && !isNew)}>
              {saveIntegration.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isNew ? 'Criar integração' : 'Salvar'}
            </Button>
          </div>
        </div>
      </div>

      {/* Dados */}
      <Panel icon={<Plug className="h-4 w-4" />} title="Dados da integração" description="Um cadastro por sistema externo.">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[88px_1fr_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="integ-icon">Ícone</Label>
              <Input
                id="integ-icon"
                value={form.icon}
                onChange={(e) => set('icon', e.target.value.slice(0, 16))}
                className="text-center text-xl"
                placeholder="🔌"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="integ-name">Nome</Label>
              <Input
                id="integ-name"
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((f) => ({ ...f, name, slug: f.slugTouched ? f.slug : slugify(name) }));
                }}
                placeholder="ex: Reserve Maya"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="integ-slug">Identificador (slug)</Label>
              <Input
                id="integ-slug"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''), slugTouched: true }))}
                placeholder="ex: reservemaya"
                className="font-mono"
                aria-invalid={!!slugProblem || slugTaken}
              />
              {(slugProblem || slugTaken) && form.slug && (
                <p className="text-[11px] text-destructive">{slugTaken ? 'Já usado por outra integração' : slugProblem}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="integ-desc">Descrição (o que o restaurante lê)</Label>
            <Textarea
              id="integ-desc"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={2}
              placeholder="ex: Reservas feitas direto pela IA no Reserve Maya."
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-1">
              <Label>Segmento</Label>
              <Select
                value={segmentMode}
                onValueChange={(v) => {
                  if (v === CUSTOM) setForm((f) => ({ ...f, segmentCustom: true, segment: '' }));
                  else setForm((f) => ({ ...f, segmentCustom: false, segment: v === ALL ? '' : v }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {SEGMENT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM}>Personalizado...</SelectItem>
                </SelectContent>
              </Select>
              {form.segmentCustom && (
                <Input
                  value={form.segment}
                  onChange={(e) => set('segment', e.target.value.slice(0, 60))}
                  placeholder="ex: petshop"
                />
              )}
              <p className="text-[11px] text-muted-foreground">Só restaurantes deste segmento veem a integração.</p>
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-xl border border-border/40 p-3">
            <div>
              <Label>Integração ativa</Label>
              <p className="text-xs text-muted-foreground">Inativa, some do catálogo e a IA para de usar em todos os restaurantes.</p>
            </div>
            <Switch checked={form.isActive} onCheckedChange={(v) => set('isActive', v)} />
          </div>
        </div>
      </Panel>

      {/* Conexao: endereco + chave (como conectar um servidor de ferramentas) */}
      <Panel
        icon={<KeyRound className="h-4 w-4" />}
        title="Conexão"
        description={
          <>
            Endereço e chave de acesso do sistema. Ficam salvos aqui, criptografados no banco (não vão no .env), e nunca
            aparecem para o restaurante. A IA chama as ferramentas abaixo sozinha, conforme o que o cliente pede na conversa.
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tipo de conexão</Label>
            <div role="radiogroup" aria-label="Tipo de conexão" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  { value: 'http', titulo: 'API (endpoints)', dica: 'Você monta cada ferramenta aqui: caminho, corpo e resposta.' },
                  { value: 'mcp', titulo: 'Servidor MCP', dica: 'Cole o endereço do servidor: as ferramentas vêm dele, prontas.' },
                ] as const
              ).map((op) => (
                <button
                  key={op.value}
                  type="button"
                  role="radio"
                  aria-checked={form.kind === op.value}
                  disabled={!podeTrocarTipo}
                  onClick={() => set('kind', op.value)}
                  className={cn(
                    'rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                    form.kind === op.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border/60 hover:border-primary/40'
                  )}
                >
                  <span className="block text-sm font-medium">{op.titulo}</span>
                  <span className="block text-xs text-muted-foreground">{op.dica}</span>
                </button>
              ))}
            </div>
            {!podeTrocarTipo && (
              <p className="text-[11px] text-muted-foreground">Para trocar o tipo, a integração não pode ter ferramentas.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="integ-url">{form.kind === 'mcp' ? 'Endereço do servidor MCP' : 'Endereço (URL base)'}</Label>
            <Input
              id="integ-url"
              value={form.baseUrl}
              onChange={(e) => set('baseUrl', e.target.value)}
              placeholder={form.kind === 'mcp' ? 'https://mcp.sistema.com/mcp' : 'https://api.sistema.com/v1'}
              className="font-mono"
              aria-invalid={!!urlProblem}
              spellCheck={false}
            />
            {urlProblem ? (
              <p className="text-[11px] text-destructive">{urlProblem}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {form.kind === 'mcp'
                  ? 'Servidor MCP por HTTP (Streamable HTTP). Depois de salvar, clique em "Buscar ferramentas do servidor".'
                  : 'As ferramentas somam o caminho delas a este endereço.'}
              </p>
            )}
          </div>
          <HeadersEditor rows={form.headers} onChange={(rows) => set('headers', rows)} />
          <p className="text-[11px] text-muted-foreground">
            Cabeçalhos aceitam variáveis, ex: <span className="font-mono">{'Bearer {{config.token}}'}</span> (chave que cada
            restaurante preenche).
          </p>
        </div>
      </Panel>

      {/* Campos do restaurante */}
      <Panel
        icon={<SlidersHorizontal className="h-4 w-4" />}
        title="Campos que o restaurante preenche"
        description={
          <>
            O que o restaurante preenche ao ativar (ex: código da conta dele). Use nas ferramentas como{' '}
            <span className="font-mono">{'{{config.chave}}'}</span>.
          </>
        }
      >
        <ConfigFieldsEditor
          rows={form.configFields}
          onChange={(rows) => set('configFields', rows)}
          savedKeys={integration?.configFields.map((f) => f.key) ?? []}
        />
      </Panel>

      {isNew ? (
        <Alert>
          <Wrench className="h-4 w-4" />
          <AlertDescription>Crie a integração para começar a adicionar as ferramentas.</AlertDescription>
        </Alert>
      ) : (
        integration && (
          <>
            {/* Ferramentas */}
            <Panel
              icon={<Wrench className="h-4 w-4" />}
              title="Ferramentas"
              description={
                ehMcp
                  ? 'Vêm do servidor MCP, com a descrição e os parâmetros dele. Busque de novo sempre que o servidor mudar. O restaurante escolhe quais ligar e a IA chama conforme a conversa.'
                  : 'Ações que a IA pode chamar. O restaurante escolhe quais ligar.'
              }
              action={
                ehMcp ? (
                  <Button size="sm" onClick={buscarFerramentas} disabled={syncMcp.isPending || dirty} title={dirty ? 'Salve antes de buscar' : undefined}>
                    {syncMcp.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Buscar ferramentas do servidor
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => openTool(null)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nova ferramenta
                  </Button>
                )
              }
            >
              {ehMcp && dirty && (
                <p className="mb-3 text-xs text-amber-700 dark:text-amber-400">
                  Salve o endereço e a chave antes de buscar as ferramentas.
                </p>
              )}
              {tools.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                  {ehMcp ? 'Nenhuma ferramenta ainda. Clique em "Buscar ferramentas do servidor".' : 'Nenhuma ferramenta ainda.'}
                </p>
              ) : (
                <div className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/40">
                  {tools.map((t) => ehMcp ? (
                    <McpToolRow
                      key={t.id}
                      integrationId={integration.id}
                      tool={t}
                      isTestTool={integration.testToolName === t.name}
                    />
                  ) : (
                    <div
                      key={t.id}
                      className={cn('flex flex-col gap-2 p-3 sm:flex-row sm:items-center', !t.isActive && 'opacity-60')}
                    >
                      <button type="button" onClick={() => openTool(t)} className="min-w-0 flex-1 text-left">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{t.label}</span>
                          <span className="font-mono text-xs text-muted-foreground">{t.name}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {t.method}
                          </Badge>
                          <span className="max-w-full truncate font-mono">{t.path || '/'}</span>
                          {t.isWrite ? (
                            <Badge className="border-transparent bg-amber-500/15 text-[10px] text-amber-700 hover:bg-amber-500/15 dark:text-amber-400">
                              altera dados
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">
                              só leitura
                            </Badge>
                          )}
                          {!t.isActive && (
                            <Badge variant="secondary" className="text-[10px]">
                              inativa
                            </Badge>
                          )}
                          {integration.testToolName === t.name && (
                            <Badge variant="outline" className="text-[10px]">
                              teste do restaurante
                            </Badge>
                          )}
                          <span>
                            · {t.companiesUsing} {t.companiesUsing === 1 ? 'restaurante' : 'restaurantes'}
                          </span>
                        </div>
                      </button>
                      <div className="flex shrink-0 gap-1 self-end sm:self-auto">
                        <Button variant="ghost" size="sm" onClick={() => openTool(t)}>
                          <Pencil className="mr-1.5 h-3.5 w-3.5" />
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setToolToDelete(t)}
                          title="Excluir ferramenta"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Uso pela IA */}
            <Panel
              icon={<Activity className="h-4 w-4" />}
              title="Uso pela IA (últimas 24h)"
              description="Todos os restaurantes. Depois de trocar o endereço ou a chave, confira aqui se voltou a funcionar."
            >
              <FailuresPanel integrationId={integration.id} />
            </Panel>

            {/* Teste do restaurante */}
            <Panel
              icon={<ListChecks className="h-4 w-4" />}
              title="Botão “Testar” do restaurante"
              description="Ferramenta e argumentos usados quando o restaurante testa a conexão. Prefira uma só de leitura."
            >
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Ferramenta de teste</Label>
                  <Select value={form.testToolName || NONE} onValueChange={(v) => set('testToolName', v === NONE ? '' : v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Nenhuma</SelectItem>
                      {tools.map((t) => (
                        <SelectItem key={t.id} value={t.name}>
                          {t.label} ({t.name})
                          {t.isWrite ? ' · altera dados' : pedeDadoDoCliente(t.parameters) ? ' · pede dado do cliente' : ' · recomendado'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {testTool?.isWrite && (
                    <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Esta ferramenta altera dados: cada teste do restaurante executaria a ação de verdade. Escolha uma só de
                      leitura.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label htmlFor="integ-test-args">Argumentos do teste (JSON)</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!testTool}
                      onClick={() => testTool && set('testArgsText', JSON.stringify(sampleArgs(testTool.parameters), null, 2))}
                    >
                      <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                      Preencher pelos parâmetros
                    </Button>
                  </div>
                  <Textarea
                    id="integ-test-args"
                    value={form.testArgsText}
                    onChange={(e) => set('testArgsText', e.target.value)}
                    rows={5}
                    className="font-mono text-[13px]"
                    placeholder={'{\n  "date": "{{agora.amanha}}",\n  "time": "20:00",\n  "people": 2\n}'}
                    spellCheck={false}
                    aria-invalid={!testArgs.ok}
                  />
                  {!testArgs.ok ? (
                    <p className="text-[11px] text-destructive">{testArgs.message}</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Pode usar <span className="font-mono">{'{{agora.amanha}}'}</span> e{' '}
                      <span className="font-mono">{'{{agora.data}}'}</span> para datas que nunca vencem.
                    </p>
                  )}
                </div>
              </div>
            </Panel>
          </>
        )
      )}

      {/* Barra de salvar (aparece com alteracoes) */}
      {dirty && (
        <div className="sticky bottom-0 z-20 -mx-4 border-t border-border/40 bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-end gap-2">
            <p className="mr-auto text-sm text-muted-foreground">
              {problems.length ? <span className="text-destructive">{problems[0]}</span> : 'Alterações não salvas'}
            </p>
            {!isNew && (
              <Button variant="outline" onClick={() => setForm(initial)}>
                Descartar
              </Button>
            )}
            <Button onClick={handleSave} disabled={saveIntegration.isPending}>
              {saveIntegration.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isNew ? 'Criar integração' : 'Salvar'}
            </Button>
          </div>
        </div>
      )}

      {integration && (
        <ToolEditorSheet
          key={editor.session}
          open={editor.open}
          onOpenChange={(open) => setEditor((s) => ({ ...s, open }))}
          integration={integration}
          tool={editingTool}
          reservedNames={reservedNames}
          otherToolNames={otherToolNames}
          onSaved={handleToolSaved}
        />
      )}

      {integration && (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={`Excluir “${integration.name}”?`}
          description={`Apaga a integração, ${integration.tools.length} ${integration.tools.length === 1 ? 'ferramenta' : 'ferramentas'} e a ativação em ${integration.companiesUsing} ${integration.companiesUsing === 1 ? 'restaurante' : 'restaurantes'} (com a configuração que preencheram). A IA deixa de usar essas ferramentas na hora. Não dá para desfazer.`}
          confirmLabel="Excluir integração"
          variant="destructive"
          isLoading={deleteIntegration.isPending}
          onConfirm={handleDelete}
        />
      )}

      <ConfirmDialog
        open={!!toolToDelete}
        onOpenChange={(open) => !open && setToolToDelete(null)}
        title={`Excluir a ferramenta “${toolToDelete?.label ?? ''}”?`}
        description={
          toolToDelete
            ? `${toolToDelete.companiesUsing ? `Ela está ligada em ${toolToDelete.companiesUsing} ${toolToDelete.companiesUsing === 1 ? 'restaurante' : 'restaurantes'} e some para eles. ` : ''}A IA deixa de poder chamar ${toolToDelete.name}. Não dá para desfazer.`
            : ''
        }
        confirmLabel="Excluir ferramenta"
        variant="destructive"
        isLoading={deleteTool.isPending}
        onConfirm={handleDeleteTool}
      />
    </div>
  );
}

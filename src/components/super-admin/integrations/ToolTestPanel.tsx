'use client';

import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { ToolParam } from '@/lib/ai-tools/types';
import { AlertTriangle, CheckCircle2, Info, Loader2, Play, XCircle } from 'lucide-react';
import { CompanyPicker } from './CompanyPicker';
import { useTestTool } from './hooks';
import { datasSaoPaulo, paramTypeLabel, type AdminIntegration, type AdminTool, type ToolTestResult } from './types';

const COMPANY_STORAGE_KEY = 'maya:integrations:test-company';
const EMPTY = '__vazio__';

function readStoredCompany(): string {
  try {
    return localStorage.getItem(COMPANY_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function storeCompany(id: string) {
  try {
    localStorage.setItem(COMPANY_STORAGE_KEY, id);
  } catch {
    // armazenamento indisponivel: so nao lembra
  }
}

/** Valores iniciais: os argumentos de teste da integracao, se for a ferramenta de teste. */
function initialValues(integration: AdminIntegration, tool: AdminTool): Record<string, string> {
  const out: Record<string, string> = {};
  const fonte = integration.testToolName === tool.name ? integration.testArgs : null;
  if (!fonte) return out;
  const { data, amanha } = datasSaoPaulo();
  for (const p of tool.parameters) {
    const v = fonte[p.key];
    if (v === undefined || v === null) continue;
    out[p.key] = String(v).replace(/\{\{\s*agora\.amanha\s*\}\}/g, amanha).replace(/\{\{\s*agora\.data\s*\}\}/g, data);
  }
  return out;
}

function buildArgs(params: ToolParam[], values: Record<string, string>): Record<string, string | number | boolean> {
  const args: Record<string, string | number | boolean> = {};
  for (const p of params) {
    const raw = (values[p.key] ?? '').trim();
    if (!raw) continue;
    if (p.type === 'boolean') args[p.key] = raw === 'true';
    else if (p.type === 'number' || p.type === 'integer') {
      const n = Number(raw.replace(',', '.'));
      // Numero invalido segue como texto: o servidor explica o erro.
      args[p.key] = Number.isFinite(n) ? n : raw;
    } else args[p.key] = raw;
  }
  return args;
}

interface Props {
  integration: AdminIntegration;
  tool: AdminTool;
  /** Formulario da ferramenta tem alteracoes nao salvas. */
  dirty: boolean;
}

export function ToolTestPanel({ integration, tool, dirty }: Props) {
  const { toast } = useToast();
  const testTool = useTestTool(integration.id);
  const [companyId, setCompanyId] = useState('');
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(integration, tool));
  const [result, setResult] = useState<ToolTestResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Lido depois de montar (localStorage nao existe no servidor). Quem usa este
  // painel passa key={tool.id + parametros} pra recomecar quando a ferramenta muda.
  useEffect(() => {
    setCompanyId(readStoredCompany());
  }, []);

  const missing = tool.parameters.filter((p) => p.required && !(values[p.key] ?? '').trim()).map((p) => p.key);

  const run = async () => {
    if (!companyId) {
      toast({ title: 'Escolha um restaurante', description: 'O teste usa a caixa de entrada e a configuração dele.', variant: 'destructive' });
      return;
    }
    setResult(null);
    try {
      const r = await testTool.mutateAsync({ toolId: tool.id, companyId, args: buildArgs(tool.parameters, values) });
      setResult(r);
    } catch (e) {
      toast({
        title: 'Erro ao testar',
        description: e instanceof Error ? e.message : 'Tente novamente',
        variant: 'destructive',
      });
    }
  };

  const setValue = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  return (
    <div className="space-y-4">
      {dirty && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Alterações não salvas</AlertTitle>
          <AlertDescription>O teste usa a versão SALVA da ferramenta. Salve antes para testar as mudanças.</AlertDescription>
        </Alert>
      )}

      {tool.isWrite && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Ação real</AlertTitle>
          <AlertDescription>
            Este teste executa a ação de verdade no sistema externo (ex: cria uma reserva real). As ações no CRM não são
            aplicadas no teste.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label>Restaurante</Label>
        <CompanyPicker
          value={companyId}
          onChange={(id) => {
            setCompanyId(id);
            storeCompany(id);
          }}
        />
        <p className="text-xs text-muted-foreground">
          Usa a configuração do restaurante nesta integração, a primeira caixa de entrada com ID do restaurante e um
          cliente fictício (Cliente Teste).
        </p>
      </div>

      {tool.parameters.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {tool.parameters.map((p) => (
            <div key={p.key} className="space-y-1">
              <Label className="text-xs">
                <span className="font-mono">{p.key}</span>
                {p.required && <span className="text-destructive"> *</span>}
                <span className="ml-1 font-normal text-muted-foreground">({paramTypeLabel(p.type)})</span>
              </Label>
              {p.type === 'boolean' || (p.type === 'string' && p.enum?.length) ? (
                <Select value={values[p.key] || EMPTY} onValueChange={(v) => setValue(p.key, v === EMPTY ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY}>(vazio)</SelectItem>
                    {p.type === 'boolean' ? (
                      <>
                        <SelectItem value="true">Sim</SelectItem>
                        <SelectItem value="false">Não</SelectItem>
                      </>
                    ) : (
                      (p.enum || []).map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type={p.type === 'date' ? 'date' : p.type === 'time' ? 'time' : p.type === 'string' ? 'text' : 'number'}
                  step={p.type === 'number' ? 'any' : undefined}
                  value={values[p.key] ?? ''}
                  onChange={(e) => setValue(p.key, e.target.value)}
                  placeholder={p.description}
                />
              )}
              {p.description && <p className="text-[11px] text-muted-foreground">{p.description}</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Esta ferramenta não tem parâmetros.</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={() => (tool.isWrite ? setConfirmOpen(true) : run())}
          disabled={testTool.isPending || !companyId}
          variant={tool.isWrite ? 'destructive' : 'default'}
        >
          {testTool.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          {tool.isWrite ? 'Executar de verdade' : 'Executar teste'}
        </Button>
        {missing.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Faltam obrigatórios: <span className="font-mono">{missing.join(', ')}</span> (o servidor vai recusar, como
            faria com a IA)
          </p>
        )}
      </div>

      {result && (
        <div
          className={`space-y-3 rounded-xl border p-4 ${
            result.ok
              ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20'
              : 'border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/20'
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            {result.ok ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            ) : (
              <XCircle className="h-5 w-5 shrink-0 text-rose-600" />
            )}
            <span className="font-medium">{result.ok ? 'Funcionou' : 'Falhou'}</span>
            {result.httpStatus !== null && (
              <Badge variant="outline" className="font-mono">
                HTTP {result.httpStatus}
              </Badge>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">O que a IA recebe</p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background/80 p-3 font-mono text-xs">
              {result.result || '(vazio)'}
            </pre>
          </div>
          {result.error && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Detalhe técnico</p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background/80 p-3 font-mono text-xs text-rose-700 dark:text-rose-300">
                {result.error}
              </pre>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Executar ação real?"
        description="Este teste executa a ação de verdade no sistema externo (ex: cria uma reserva real). Use dados de teste e desfaça no sistema externo depois, se precisar."
        confirmLabel="Executar mesmo assim"
        variant="destructive"
        onConfirm={() => {
          setConfirmOpen(false);
          void run();
        }}
      />
    </div>
  );
}

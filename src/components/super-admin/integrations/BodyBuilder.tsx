'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import {
  builderEntries,
  CRM_FIELDS,
  duplicateKeys,
  fixedRowProblem,
  newFixedRow,
  type BodyBuilderState,
  type CrmChoice,
  type CrmFieldId,
  type FixedRow,
} from './bodyBuilderModel';

/**
 * "O que enviar" no modo simples: monta o corpo da chamada sem variaveis.
 * As funcoes de ler/montar o JSON ficam em bodyBuilderModel.ts.
 */

interface ParamInfo {
  /** Id da linha (key do React). */
  id: string;
  key: string;
  description: string;
}

interface Props {
  value: BodyBuilderState;
  onChange: (next: BodyBuilderState) => void;
  /** O que a IA pergunta ao cliente (vai sempre, com a propria chave). */
  params: ParamInfo[];
}

function GroupTitle({ children, help }: { children: ReactNode; help?: string }) {
  return (
    <div>
      <p className="text-xs font-semibold">{children}</p>
      {help && <p className="text-[11px] text-muted-foreground">{help}</p>}
    </div>
  );
}

export function BodyBuilder({ value, onChange, params }: Props) {
  const paramKeys = params.map((p) => p.key);
  const dupes = duplicateKeys(value, paramKeys);
  const sentKeys = builderEntries(value, paramKeys).map((e) => e.key);

  const setCrm = (id: CrmFieldId, patch: Partial<CrmChoice>) =>
    onChange({ ...value, crm: { ...value.crm, [id]: { ...value.crm[id], ...patch } } });

  const updateFixed = (id: string, patch: Partial<FixedRow>) =>
    onChange({ ...value, fixed: value.fixed.map((r) => (r.uid === id ? { ...r, ...patch } : r)) });

  return (
    <div className="space-y-4">
      {/* 1. O que o cliente disse */}
      <div className="space-y-2">
        <GroupTitle help="Tudo o que a IA pergunta ao cliente vai junto, com o mesmo nome.">
          O que o cliente disse (vai sempre)
        </GroupTitle>
        {params.length ? (
          <div className="flex flex-wrap gap-1.5">
            {params.map((p) => (
              <span
                key={p.id}
                className={cn(
                  'inline-flex max-w-full items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs',
                  dupes.has(p.key) ? 'border-destructive' : 'border-border'
                )}
              >
                <span className="font-mono font-medium">{p.key}</span>
                <ArrowLeft className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate text-muted-foreground">{p.description.trim() || 'o que o cliente disse'}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Nada por enquanto. Adicione em &quot;O que a IA pergunta ao cliente&quot;.
          </p>
        )}
      </div>

      {/* 2. Dados do CRM */}
      <div className="space-y-2">
        <GroupTitle help="Marque o que o sistema precisa receber. O CRM preenche sozinho, a IA não inventa.">
          Dados do CRM enviados automaticamente
        </GroupTitle>
        <div className="divide-y divide-border/40 rounded-xl border border-border/50">
          {CRM_FIELDS.map((f) => {
            const c = value.crm[f.id];
            const key = c.key.trim();
            const keyProblem = c.enabled ? (!key ? 'Dê um nome' : dupes.has(key) ? 'Nome repetido' : null) : null;
            return (
              <div key={f.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
                <label className="flex min-w-0 cursor-pointer items-start gap-2.5">
                  <Checkbox
                    className="mt-0.5"
                    checked={c.enabled}
                    onCheckedChange={(v) => setCrm(f.id, { enabled: v === true })}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{f.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{f.help}</span>
                  </span>
                </label>
                {c.enabled && (
                  <div className="space-y-1 pl-6 sm:w-52 sm:shrink-0 sm:pl-0">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-[11px] text-muted-foreground">enviado como</span>
                      <Input
                        value={c.key}
                        onChange={(e) => setCrm(f.id, { key: e.target.value.replace(/\s/g, '_') })}
                        placeholder={f.defaultKey}
                        className="h-8 font-mono text-xs"
                        aria-label={`Nome do campo para ${f.label}`}
                        aria-invalid={!!keyProblem}
                        spellCheck={false}
                      />
                    </div>
                    {keyProblem && <p className="text-right text-[11px] text-destructive">{keyProblem}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Campos fixos */}
      <div className="space-y-2">
        <GroupTitle help="Valores que vão sempre iguais. Ex: action = check_availability.">Campos fixos</GroupTitle>
        {value.fixed.map((row) => {
          const problem = fixedRowProblem(row) ?? (dupes.has(row.key.trim()) ? 'Nome repetido' : null);
          return (
            <div key={row.uid} className="space-y-1">
              <div className="flex items-start gap-2">
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input
                    value={row.key}
                    onChange={(e) => updateFixed(row.uid, { key: e.target.value.replace(/\s/g, '_') })}
                    placeholder="nome (ex: action)"
                    className="font-mono"
                    aria-label="Nome do campo fixo"
                    aria-invalid={!!problem && !row.key.trim()}
                    spellCheck={false}
                  />
                  {row.kind === 'boolean' ? (
                    <Select value={row.value} onValueChange={(v) => updateFixed(row.uid, { value: v === 'true' ? 'true' : 'false' })}>
                      <SelectTrigger aria-label="Valor do campo fixo">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Sim (true)</SelectItem>
                        <SelectItem value="false">Não (false)</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={row.value}
                      onChange={(e) => updateFixed(row.uid, { value: e.target.value })}
                      placeholder={row.kind === 'number' ? 'número' : 'valor (ex: check_availability)'}
                      inputMode={row.kind === 'number' ? 'decimal' : undefined}
                      aria-label="Valor do campo fixo"
                      spellCheck={false}
                    />
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-destructive hover:text-destructive"
                  onClick={() => onChange({ ...value, fixed: value.fixed.filter((r) => r.uid !== row.uid) })}
                  title="Remover campo"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {problem ? (
                <p className="text-[11px] text-destructive">{problem}</p>
              ) : row.kind !== 'text' ? (
                <p className="text-[11px] text-muted-foreground">
                  Enviado como {row.kind === 'number' ? 'número' : 'sim/não'}.
                </p>
              ) : null}
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange({ ...value, fixed: [...value.fixed, newFixedRow()] })}
        >
          <Plus className="mr-2 h-4 w-4" />
          Adicionar campo fixo
        </Button>
      </div>

      <p className="rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
        {sentKeys.length ? (
          <>
            Campos enviados: <span className="break-words font-mono text-foreground">{sentKeys.join(', ')}</span>
          </>
        ) : (
          'Nada marcado: a chamada vai sem corpo.'
        )}
      </p>
    </div>
  );
}

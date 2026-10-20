'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isValidParamKey } from '@/lib/ai-tools/params';
import type { ToolParamType } from '@/lib/ai-tools/types';
import { Plus, Trash2 } from 'lucide-react';
import { PARAM_TYPE_OPTIONS, uid } from './types';

export interface ParamRow {
  uid: string;
  key: string;
  type: ToolParamType;
  description: string;
  required: boolean;
  /** Opcoes separadas por virgula (so para texto). */
  options: string;
}

export function newParamRow(): ParamRow {
  return { uid: uid(), key: '', type: 'string', description: '', required: true, options: '' };
}

/** Problema de uma linha (ou null). */
export function paramRowProblem(row: ParamRow, all: ParamRow[]): string | null {
  const key = row.key.trim();
  if (!key) return 'Informe o nome do campo';
  if (!isValidParamKey(key)) return 'Use letras, números e _ (sem espaço e sem começar com número)';
  if (all.filter((r) => r.key.trim() === key).length > 1) return 'Nome repetido';
  return null;
}

interface Props {
  rows: ParamRow[];
  onChange: (rows: ParamRow[]) => void;
}

export function ParamsEditor({ rows, onChange }: Props) {
  const update = (id: string, patch: Partial<ParamRow>) =>
    onChange(rows.map((r) => (r.uid === id ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-3">
      {rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
          Nenhuma pergunta. A IA usa a ferramenta sem pedir nada ao cliente.
        </p>
      )}

      {rows.map((row) => {
        const problem = paramRowProblem(row, rows);
        return (
          <div key={row.uid} className="rounded-xl border border-border/50 bg-card/60 p-3 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_150px_auto]">
              <div className="space-y-1">
                <Label className="text-xs">Nome do campo (como o sistema recebe)</Label>
                <Input
                  value={row.key}
                  onChange={(e) => update(row.uid, { key: e.target.value.replace(/\s/g, '_') })}
                  placeholder="ex: date"
                  className="font-mono"
                  aria-invalid={!!problem}
                />
                {problem && <p className="text-[11px] text-destructive">{problem}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Select value={row.type} onValueChange={(v) => update(row.uid, { type: v as ToolParamType })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARAM_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end justify-between gap-3 sm:justify-end">
                <label className="flex h-10 items-center gap-2 text-sm">
                  <Checkbox
                    checked={row.required}
                    onCheckedChange={(v) => update(row.uid, { required: v === true })}
                  />
                  Obrigatório
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onChange(rows.filter((r) => r.uid !== row.uid))}
                  title="Remover"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">O que é (a IA lê isso para perguntar ao cliente)</Label>
              <Input
                value={row.description}
                onChange={(e) => update(row.uid, { description: e.target.value })}
                placeholder="ex: Data da reserva"
              />
            </div>
            {row.type === 'string' && (
              <div className="space-y-1">
                <Label className="text-xs">Só aceita estas opções (opcional, separe por vírgula)</Label>
                <Input
                  value={row.options}
                  onChange={(e) => update(row.uid, { options: e.target.value })}
                  placeholder="ex: almoco, jantar"
                />
              </div>
            )}
            {(row.type === 'date' || row.type === 'time') && (
              <p className="text-[11px] text-muted-foreground">
                A IA recebe o formato {row.type === 'date' ? 'AAAA-MM-DD' : 'HH:MM (24h)'} e o servidor valida antes de
                chamar o sistema externo.
              </p>
            )}
          </div>
        );
      })}

      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, newParamRow()])}>
        <Plus className="mr-2 h-4 w-4" />
        Adicionar pergunta
      </Button>
    </div>
  );
}

'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ConfigField } from '@/lib/ai-tools/types';
import { Plus, Trash2 } from 'lucide-react';
import { KEY_RE, uid } from './types';

/** Campos que o RESTAURANTE preenche ao ativar a integracao. */

export interface ConfigFieldRow {
  uid: string;
  key: string;
  label: string;
  help: string;
  required: boolean;
  secret: boolean;
}

export function configRowsFrom(fields: ConfigField[]): ConfigFieldRow[] {
  return fields.map((f) => ({
    uid: uid(),
    key: f.key,
    label: f.label,
    help: f.help ?? '',
    required: f.required === true,
    secret: f.secret === true,
  }));
}

export function configRowProblem(row: ConfigFieldRow, all: ConfigFieldRow[]): string | null {
  const key = row.key.trim();
  if (!key) return 'Informe a chave';
  if (!KEY_RE.test(key)) return 'Chave: letras, números e _ (sem começar com número)';
  if (all.filter((r) => r.key.trim() === key).length > 1) return 'Chave repetida';
  if (!row.label.trim()) return 'Informe o rótulo';
  return null;
}

export function configFieldsPayload(rows: ConfigFieldRow[]): ConfigField[] {
  return rows.map((r) => ({
    key: r.key.trim(),
    label: r.label.trim(),
    ...(r.help.trim() ? { help: r.help.trim() } : {}),
    required: r.required,
    secret: r.secret,
  }));
}

interface Props {
  rows: ConfigFieldRow[];
  onChange: (rows: ConfigFieldRow[]) => void;
  /** Chaves ja salvas (aviso ao renomear). */
  savedKeys: string[];
}

export function ConfigFieldsEditor({ rows, onChange, savedKeys }: Props) {
  const update = (id: string, patch: Partial<ConfigFieldRow>) =>
    onChange(rows.map((r) => (r.uid === id ? { ...r, ...patch } : r)));
  const removedSaved = savedKeys.filter((k) => !rows.some((r) => r.key.trim() === k));

  return (
    <div className="space-y-3">
      {rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
          Nenhum campo. O restaurante só liga a integração, sem preencher nada.
        </p>
      )}

      {rows.map((row) => {
        const problem = configRowProblem(row, rows);
        return (
          <div key={row.uid} className="space-y-3 rounded-xl border border-border/50 bg-card/60 p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Chave (usada em {'{{config.chave}}'})</Label>
                <Input
                  value={row.key}
                  onChange={(e) => update(row.uid, { key: e.target.value.replace(/\s/g, '_') })}
                  placeholder="ex: restaurant_code"
                  className="font-mono"
                  spellCheck={false}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rótulo (o que o restaurante lê)</Label>
                <Input
                  value={row.label}
                  onChange={(e) => update(row.uid, { label: e.target.value })}
                  placeholder="ex: Código do restaurante"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ajuda (opcional)</Label>
              <Input
                value={row.help}
                onChange={(e) => update(row.uid, { help: e.target.value })}
                placeholder="ex: Encontre em Configurações > Integrações no sistema"
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={row.required} onCheckedChange={(v) => update(row.uid, { required: v === true })} />
                Obrigatório
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={row.secret} onCheckedChange={(v) => update(row.uid, { secret: v === true })} />
                Secreto (guardado criptografado, mostrado mascarado)
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto text-destructive hover:text-destructive"
                onClick={() => onChange(rows.filter((r) => r.uid !== row.uid))}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Remover
              </Button>
            </div>
            {problem && <p className="text-[11px] text-destructive">{problem}</p>}
          </div>
        );
      })}

      {removedSaved.length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Os restaurantes que já preencheram <span className="font-mono">{removedSaved.join(', ')}</span> perdem esse valor
          ao salvar (chave removida ou renomeada).
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...rows, { uid: uid(), key: '', label: '', help: '', required: true, secret: false }])}
      >
        <Plus className="mr-2 h-4 w-4" />
        Adicionar campo
      </Button>
    </div>
  );
}

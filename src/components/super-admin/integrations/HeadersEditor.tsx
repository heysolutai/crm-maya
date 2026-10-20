'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, EyeOff, KeyRound, Lock, Plus, Trash2 } from 'lucide-react';
import { HEADER_NAME_RE, MASK, uid } from './types';

/**
 * Cabecalhos da PLATAFORMA (credenciais). Valores salvos chegam como MASK e
 * voltam como MASK quando nao mudam (o servidor mantem o valor cifrado).
 */

export interface HeaderRow {
  uid: string;
  name: string;
  value: string;
  /** Nome com que o valor esta salvo no servidor ('' = linha nova). */
  savedName: string;
}

export function headerRowsFrom(headers: Record<string, string>): HeaderRow[] {
  return Object.keys(headers).map((name) => ({ uid: uid(), name, value: MASK, savedName: name }));
}

export function headerRowProblem(row: HeaderRow, all: HeaderRow[]): string | null {
  const name = row.name.trim();
  if (!name) return row.value ? 'Informe o nome do cabeçalho' : null;
  if (!HEADER_NAME_RE.test(name)) return 'Nome inválido (sem espaços nem acentos)';
  if (all.filter((r) => r.name.trim().toLowerCase() === name.toLowerCase()).length > 1) return 'Cabeçalho repetido';
  if (row.value === MASK && name !== row.savedName) return 'Ao renomear, digite o valor de novo';
  if (!row.value) return 'Informe o valor';
  if (/[\r\n]/.test(row.value)) return 'O valor não pode ter quebra de linha';
  return null;
}

/** { nome: valor | MASK } pro PUT/POST. */
export function headersPayload(rows: HeaderRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const name = r.name.trim();
    if (name) out[name] = r.value;
  }
  return out;
}

/** Jeitos comuns de mandar a chave de API: cada um vira um ou mais cabeçalhos. */
const ESTILOS_CHAVE: { value: string; label: string; cabecalhos: (chave: string) => [string, string][] }[] = [
  { value: 'bearer', label: 'Authorization: Bearer (o mais comum)', cabecalhos: (k) => [['Authorization', `Bearer ${k}`]] },
  { value: 'x-api-key', label: 'x-api-key', cabecalhos: (k) => [['x-api-key', k]] },
  { value: 'apikey', label: 'apikey', cabecalhos: (k) => [['apikey', k]] },
  {
    value: 'supabase',
    label: 'Supabase (apikey + Bearer)',
    cabecalhos: (k) => [
      ['apikey', k],
      ['Authorization', `Bearer ${k}`],
    ],
  },
];

/** Cola a chave, escolhe como o sistema espera e vira cabeçalho (substitui o de mesmo nome). */
function ChaveRapida({ rows, onChange }: Props) {
  const [chave, setChave] = useState('');
  const [estilo, setEstilo] = useState(ESTILOS_CHAVE[0].value);
  const [ver, setVer] = useState(false);

  const adicionar = () => {
    const k = chave.trim();
    const e = ESTILOS_CHAVE.find((x) => x.value === estilo);
    if (!k || !e || /[\r\n]/.test(k)) return;
    let proximas = [...rows];
    for (const [nome, valor] of e.cabecalhos(k)) {
      const i = proximas.findIndex((r) => r.name.trim().toLowerCase() === nome.toLowerCase());
      if (i >= 0) proximas[i] = { ...proximas[i], name: nome, value: valor };
      else proximas = [...proximas, { uid: uid(), name: nome, value: valor, savedName: '' }];
    }
    onChange(proximas);
    setChave('');
  };

  return (
    <div className="space-y-2 rounded-xl border border-border/40 bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-primary" />
        <Label htmlFor="chave-rapida" className="text-sm font-medium">
          Chave de API
        </Label>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_auto]">
        <div className="flex gap-2">
          <Input
            id="chave-rapida"
            type={ver ? 'text' : 'password'}
            value={chave}
            onChange={(e) => setChave(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                adicionar();
              }
            }}
            placeholder="Cole a chave aqui"
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={() => setVer((v) => !v)}
            title={ver ? 'Esconder' : 'Mostrar'}
          >
            {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
        <Select value={estilo} onValueChange={setEstilo}>
          <SelectTrigger aria-label="Como o sistema recebe a chave">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ESTILOS_CHAVE.map((e) => (
              <SelectItem key={e.value} value={e.value}>
                {e.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" onClick={adicionar} disabled={!chave.trim()}>
          Usar esta chave
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Vira cabeçalho logo abaixo (troca o de mesmo nome). Clique em Salvar para gravar: fica criptografada no banco,
        sem .env, e nunca aparece para o restaurante.
      </p>
    </div>
  );
}

interface Props {
  rows: HeaderRow[];
  onChange: (rows: HeaderRow[]) => void;
}

export function HeadersEditor({ rows, onChange }: Props) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const update = (id: string, patch: Partial<HeaderRow>) =>
    onChange(rows.map((r) => (r.uid === id ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-3">
      <ChaveRapida rows={rows} onChange={onChange} />

      {rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-amber-500/50 bg-amber-500/5 p-4 text-center text-sm text-amber-700 dark:text-amber-400">
          Nenhuma chave cadastrada. Se o sistema exige chave de API, cole acima.
        </p>
      )}

      {rows.map((row) => {
        const problem = headerRowProblem(row, rows);
        const kept = row.value === MASK;
        return (
          <div key={row.uid} className="space-y-1">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto]">
              <Input
                value={row.name}
                onChange={(e) => update(row.uid, { name: e.target.value })}
                placeholder="ex: Authorization"
                className="font-mono"
                spellCheck={false}
              />
              {kept ? (
                <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-muted/40 px-3">
                  <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono text-sm text-muted-foreground">{MASK}</span>
                  <Badge variant="secondary" className="ml-auto shrink-0 text-[10px]">
                    salvo
                  </Badge>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto shrink-0 px-0"
                    onClick={() => update(row.uid, { value: '' })}
                  >
                    Trocar
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    type={revealed[row.uid] ? 'text' : 'password'}
                    value={row.value}
                    onChange={(e) => update(row.uid, { value: e.target.value })}
                    placeholder={row.savedName ? 'Novo valor' : 'ex: Bearer sk-...'}
                    className="font-mono"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => setRevealed((p) => ({ ...p, [row.uid]: !p[row.uid] }))}
                    title={revealed[row.uid] ? 'Esconder' : 'Mostrar'}
                  >
                    {revealed[row.uid] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  {row.savedName && (
                    <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => update(row.uid, { value: MASK, name: row.savedName })}>
                      Manter
                    </Button>
                  )}
                </div>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="justify-self-end text-destructive hover:text-destructive"
                onClick={() => onChange(rows.filter((r) => r.uid !== row.uid))}
                title="Remover cabeçalho"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {problem && <p className="text-[11px] text-destructive">{problem}</p>}
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...rows, { uid: uid(), name: '', value: '', savedName: '' }])}
      >
        <Plus className="mr-2 h-4 w-4" />
        Adicionar outro cabeçalho
      </Button>
    </div>
  );
}

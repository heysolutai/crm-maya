'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { PostAction } from '@/lib/ai-tools/types';
import { Plus, Trash2 } from 'lucide-react';
import { TemplateInput } from './TemplateFields';
import { POST_ACTION_META, POST_ACTION_TYPES, uid, type PostActionType } from './types';

export interface ActionRow {
  uid: string;
  type: PostActionType;
  data: string;
  hora: string;
  pessoas: string;
  codigo: string;
  observacao: string;
  tipo: 'normal' | 'evento';
  destino: 'humano' | 'evento';
  etiqueta: string;
}

function blankRow(type: PostActionType): ActionRow {
  return {
    uid: uid(),
    type,
    data: '',
    hora: '',
    pessoas: '',
    codigo: '',
    observacao: '',
    tipo: 'normal',
    destino: 'humano',
    etiqueta: '',
  };
}

export function actionRowFrom(action: PostAction): ActionRow {
  const row = blankRow(action.type);
  switch (action.type) {
    case 'registrar_reserva':
      return {
        ...row,
        data: action.data ?? '',
        hora: action.hora ?? '',
        pessoas: action.pessoas ?? '',
        codigo: action.codigo ?? '',
        observacao: action.observacao ?? '',
        tipo: action.tipo === 'evento' ? 'evento' : 'normal',
      };
    case 'cancelar_reserva_crm':
      return { ...row, codigo: action.codigo ?? '' };
    case 'registrar_encaminhamento':
      return { ...row, destino: action.destino === 'evento' ? 'evento' : 'humano' };
    case 'adicionar_etiqueta':
      return { ...row, etiqueta: action.etiqueta ?? '' };
  }
}

export function actionFromRow(row: ActionRow): PostAction {
  switch (row.type) {
    case 'registrar_reserva':
      return {
        type: 'registrar_reserva',
        data: row.data.trim(),
        hora: row.hora.trim(),
        pessoas: row.pessoas.trim(),
        codigo: row.codigo.trim(),
        observacao: row.observacao.trim(),
        tipo: row.tipo,
      };
    case 'cancelar_reserva_crm':
      return { type: 'cancelar_reserva_crm', codigo: row.codigo.trim() };
    case 'registrar_encaminhamento':
      return { type: 'registrar_encaminhamento', destino: row.destino };
    case 'adicionar_etiqueta':
      return { type: 'adicionar_etiqueta', etiqueta: row.etiqueta.trim() };
  }
}

/** Erro (impede salvar) ou aviso de uma acao; null = ok. */
export function actionRowProblem(row: ActionRow): { level: 'error' | 'warning'; message: string } | null {
  if (row.type === 'cancelar_reserva_crm' && !row.codigo.trim()) return { level: 'error', message: 'Informe o código da reserva' };
  if (row.type === 'adicionar_etiqueta' && !row.etiqueta.trim()) return { level: 'error', message: 'Informe a etiqueta' };
  if (row.type === 'registrar_reserva' && (!row.data.trim() || !row.hora.trim())) {
    return { level: 'warning', message: 'Sem data e hora a reserva entra no CRM sem horário' };
  }
  return null;
}

interface Props {
  rows: ActionRow[];
  onChange: (rows: ActionRow[]) => void;
}

export function PostActionsEditor({ rows, onChange }: Props) {
  const [adding, setAdding] = useState<string>('');
  const update = (id: string, patch: Partial<ActionRow>) =>
    onChange(rows.map((r) => (r.uid === id ? { ...r, ...patch } : r)));

  const field = (row: ActionRow, key: 'data' | 'hora' | 'pessoas' | 'codigo' | 'observacao' | 'etiqueta', label: string, placeholder: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <TemplateInput
        value={row[key]}
        onValueChange={(v) => {
          const patch: Partial<ActionRow> = {};
          patch[key] = v;
          update(row.uid, patch);
        }}
        fieldLabel={`${POST_ACTION_META[row.type].label}: ${label}`}
        allowResposta
        placeholder={placeholder}
      />
    </div>
  );

  return (
    <div className="space-y-3">
      {rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
          Nenhuma ação. O CRM só repassa a resposta para a IA.
        </p>
      )}

      {rows.map((row) => {
        const meta = POST_ACTION_META[row.type];
        const problem = actionRowProblem(row);
        return (
          <div key={row.uid} className="rounded-xl border border-border/50 bg-card/60 p-3 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{meta.label}</p>
                <p className="text-xs text-muted-foreground">{meta.help}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-destructive hover:text-destructive"
                onClick={() => onChange(rows.filter((r) => r.uid !== row.uid))}
                title="Remover ação"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {row.type === 'registrar_reserva' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {field(row, 'data', 'Data (AAAA-MM-DD)', '{{args.date}}')}
                {field(row, 'hora', 'Hora (HH:MM)', '{{args.time}}')}
                {field(row, 'pessoas', 'Pessoas', '{{args.people}}')}
                {field(row, 'codigo', 'Código no sistema externo', '{{resposta.reservation_id}}')}
                {field(row, 'observacao', 'Observação', "{{args.comment || ''}}")}
                <div className="space-y-1">
                  <Label className="text-xs">Tipo</Label>
                  <Select value={row.tipo} onValueChange={(v) => update(row.uid, { tipo: v === 'evento' ? 'evento' : 'normal' })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Reserva normal</SelectItem>
                      <SelectItem value="evento">Evento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {row.type === 'cancelar_reserva_crm' && field(row, 'codigo', 'Código da reserva', '{{args.reservation_id}}')}

            {row.type === 'registrar_encaminhamento' && (
              <div className="space-y-1">
                <Label className="text-xs">Destino</Label>
                <Select
                  value={row.destino}
                  onValueChange={(v) => update(row.uid, { destino: v === 'evento' ? 'evento' : 'humano' })}
                >
                  <SelectTrigger className="sm:w-60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="humano">Atendente humano</SelectItem>
                    <SelectItem value="evento">Equipe de eventos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {row.type === 'adicionar_etiqueta' && field(row, 'etiqueta', 'Etiqueta', 'ex: reserva-ia')}

            {problem && (
              <p className={problem.level === 'error' ? 'text-[11px] text-destructive' : 'text-[11px] text-amber-600 dark:text-amber-400'}>
                {problem.message}
              </p>
            )}
          </div>
        );
      })}

      <Select
        value={adding}
        onValueChange={(v) => {
          if (POST_ACTION_TYPES.includes(v as PostActionType)) onChange([...rows, blankRow(v as PostActionType)]);
          setAdding('');
        }}
      >
        <SelectTrigger className="w-full sm:w-72">
          <span className="flex items-center gap-2 text-sm">
            <Plus className="h-4 w-4" />
            Adicionar ação no CRM
          </span>
        </SelectTrigger>
        <SelectContent>
          {POST_ACTION_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {POST_ACTION_META[t].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

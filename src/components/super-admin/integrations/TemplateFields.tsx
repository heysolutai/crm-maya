'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Braces } from 'lucide-react';

/**
 * Campos que aceitam modelos {{...}} e o painel "Variáveis disponíveis":
 * clicar numa variavel insere no ultimo campo de modelo focado (na posicao
 * do cursor) ou, sem campo, copia pra area de transferencia.
 */

type FieldEl = HTMLInputElement | HTMLTextAreaElement;

interface Target {
  el: FieldEl;
  label: string;
  allowResposta: boolean;
  apply: (next: string) => void;
}

interface Ctx {
  register: (t: Target) => void;
  targetRef: React.MutableRefObject<Target | null>;
  activeLabel: string | null;
}

const TemplateCtx = createContext<Ctx | null>(null);

export function TemplateTargetProvider({ children }: { children: ReactNode }) {
  const targetRef = useRef<Target | null>(null);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const register = useCallback((t: Target) => {
    targetRef.current = t;
    setActiveLabel(t.label);
  }, []);
  const value = useMemo(() => ({ register, targetRef, activeLabel }), [register, activeLabel]);
  return <TemplateCtx.Provider value={value}>{children}</TemplateCtx.Provider>;
}

interface TemplateFieldProps {
  value: string;
  onValueChange: (next: string) => void;
  /** Nome do campo mostrado no painel ("Inserindo em: ..."). */
  fieldLabel: string;
  /** Aceita {{resposta.x}} (resposta pra IA e acoes no CRM). */
  allowResposta?: boolean;
}

type InputProps = Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'> & TemplateFieldProps;

/**
 * O painel insere chamando o onValueChange MAIS RECENTE do campo (nao o da
 * hora do foco): senao uma mudanca feita em outro controle (select, checkbox)
 * depois do foco seria desfeita.
 */
function useLatest<T>(value: T): React.MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export function TemplateInput({ value, onValueChange, fieldLabel, allowResposta = false, onFocus, className, ...rest }: InputProps) {
  const ctx = useContext(TemplateCtx);
  const latest = useLatest(onValueChange);
  return (
    <Input
      {...rest}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      onFocus={(e) => {
        ctx?.register({ el: e.currentTarget, label: fieldLabel, allowResposta, apply: (v) => latest.current(v) });
        onFocus?.(e);
      }}
      className={cn('font-mono', className)}
      spellCheck={false}
    />
  );
}

type TextareaProps = Omit<React.ComponentProps<typeof Textarea>, 'value' | 'onChange'> & TemplateFieldProps;

export function TemplateTextarea({
  value,
  onValueChange,
  fieldLabel,
  allowResposta = false,
  onFocus,
  className,
  ...rest
}: TextareaProps) {
  const ctx = useContext(TemplateCtx);
  const latest = useLatest(onValueChange);
  return (
    <Textarea
      {...rest}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      onFocus={(e) => {
        ctx?.register({ el: e.currentTarget, label: fieldLabel, allowResposta, apply: (v) => latest.current(v) });
        onFocus?.(e);
      }}
      className={cn('font-mono text-[13px]', className)}
      spellCheck={false}
    />
  );
}

interface Chip {
  text: string;
  title: string;
  resposta?: boolean;
}

interface VariablesHelperProps {
  paramKeys: string[];
  configKeys: string[];
  className?: string;
}

export function VariablesHelper({ paramKeys, configKeys, className }: VariablesHelperProps) {
  const ctx = useContext(TemplateCtx);
  const { toast } = useToast();

  const groups: { title: string; chips: Chip[] }[] = [
    {
      title: 'Argumentos da IA',
      chips: paramKeys.length
        ? paramKeys.map((k) => ({ text: `{{args.${k}}}`, title: `Valor do parâmetro "${k}" informado pela IA` }))
        : [],
    },
    {
      title: 'Configuração do restaurante',
      chips: configKeys.map((k) => ({ text: `{{config.${k}}}`, title: `Campo "${k}" preenchido pelo restaurante` })),
    },
    {
      title: 'Dados do CRM',
      chips: [
        { text: '{{inbox.restaurant_id}}', title: 'ID do restaurante configurado na caixa de entrada' },
        { text: '{{cliente.nome}}', title: 'Nome do cliente da conversa' },
        { text: '{{cliente.telefone}}', title: 'Telefone do cliente (só números)' },
        { text: '{{conversa.id}}', title: 'ID da conversa' },
        { text: '{{empresa.nome}}', title: 'Nome do restaurante' },
        { text: '{{agora.data}}', title: 'Hoje (AAAA-MM-DD, horário de Brasília)' },
        { text: '{{agora.amanha}}', title: 'Amanhã (AAAA-MM-DD)' },
        { text: '{{agora.hora}}', title: 'Hora atual (HH:MM)' },
      ],
    },
    {
      title: 'Resposta do sistema externo',
      chips: [
        {
          text: '{{resposta.campo}}',
          title: 'Campo do JSON de resposta (ex: resposta.reservation.id). Só na resposta para a IA e nas ações no CRM.',
          resposta: true,
        },
      ],
    },
  ];

  const handleClick = async (chip: Chip) => {
    const target = ctx?.targetRef.current;
    if (target && target.el.isConnected) {
      if (chip.resposta && !target.allowResposta) {
        toast({
          title: '{{resposta.*}} não vale aqui',
          description: 'Use variáveis de resposta só na resposta para a IA e nas ações no CRM.',
          variant: 'destructive',
        });
        return;
      }
      const el = target.el;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      target.apply(el.value.slice(0, start) + chip.text + el.value.slice(end));
      requestAnimationFrame(() => {
        el.focus();
        // Seleciona "campo" em {{resposta.campo}} pra digitar por cima.
        const from = chip.resposta ? start + '{{resposta.'.length : start + chip.text.length;
        const to = chip.resposta ? from + 'campo'.length : from;
        try {
          el.setSelectionRange(from, to);
        } catch {
          // tipos de input sem selecao
        }
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(chip.text);
      toast({ title: 'Copiado', description: chip.text });
    } catch {
      toast({ title: 'Não foi possível copiar', description: chip.text, variant: 'destructive' });
    }
  };

  return (
    <div className={cn('rounded-xl border border-border/50 bg-muted/30 p-3 space-y-2.5', className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Braces className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium">Variáveis disponíveis</p>
        <p className="text-xs text-muted-foreground">
          {ctx?.activeLabel ? (
            <>
              Clique para inserir em <span className="font-medium text-foreground">{ctx.activeLabel}</span>
            </>
          ) : (
            'Clique num campo e depois na variável para inserir (ou para copiar)'
          )}
        </p>
      </div>
      {groups
        .filter((g) => g.chips.length)
        .map((g) => (
          <div key={g.title} className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{g.title}</p>
            <div className="flex flex-wrap gap-1.5">
              {g.chips.map((chip) => (
                <button
                  key={chip.text}
                  type="button"
                  title={chip.title}
                  // Mantem o foco (e a posicao do cursor) no campo.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleClick(chip)}
                  className={cn(
                    'rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors hover:bg-primary hover:text-primary-foreground',
                    chip.resposta ? 'border-dashed border-primary/50 bg-background' : 'border-border bg-background'
                  )}
                >
                  {chip.text}
                </button>
              ))}
            </div>
          </div>
        ))}
      <p className="text-[11px] text-muted-foreground">
        Alternativas: <code className="font-mono">{"{{args.x || cliente.nome || 'padrão'}}"}</code> usa o primeiro que
        tiver valor. Um campo que é só <code className="font-mono">{'{{args.pessoas}}'}</code> mantém o tipo (número,
        sim/não) no JSON.
      </p>
    </div>
  );
}

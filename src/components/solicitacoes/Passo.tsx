import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  n: number;
  titulo: string;
  /** Uma frase dizendo para que serve o passo. */
  dica?: string;
  /** Algo à direita do título (ex.: chave liga/desliga). */
  acao?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Último passo: sem a linha que liga ao próximo. */
  ultimo?: boolean;
}

/**
 * Um passo da configuração: cartão com contorno, número em destaque, título e
 * a explicação logo abaixo. Os passos vêm em ordem, um embaixo do outro,
 * ligados por uma linha: dá para bater o olho e saber onde está.
 */
export function Passo({ n, titulo, dica, acao, children, className, ultimo }: Props) {
  return (
    <section className={cn('relative pl-12', className)}>
      {/* Linha que liga os passos */}
      {!ultimo && <span aria-hidden="true" className="absolute bottom-[-1.25rem] left-[15px] top-9 w-px bg-border" />}
      <span className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-sm">
        {n}
      </span>
      <div className="rounded-2xl border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-start justify-between gap-4 px-5 pt-4">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold leading-tight">{titulo}</h3>
            {dica && <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{dica}</p>}
          </div>
          {acao}
        </div>
        {children ? <div className="space-y-4 px-5 pb-5 pt-4">{children}</div> : <div className="pb-4" />}
      </div>
    </section>
  );
}

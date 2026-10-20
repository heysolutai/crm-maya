'use client';

import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface Props {
  id: string;
  label: string;
  help?: string | null;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  /** Avisos / links logo abaixo do texto. */
  children?: ReactNode;
  className?: string;
}

/** Uma habilidade da IA: texto simples + chave que salva na hora. */
export function AbilityRow({ id, label, help, checked, disabled, onChange, children, className }: Props) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-4 py-3 sm:px-6', className)}>
      <div className="min-w-0 space-y-0.5">
        <Label htmlFor={id} className="cursor-pointer text-sm font-medium leading-snug">
          {label}
        </Label>
        {help && <p className="text-sm text-muted-foreground">{help}</p>}
        {children}
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        className="mt-0.5 shrink-0"
        aria-label={label}
      />
    </div>
  );
}

/** Aviso amarelo com uma ação (link ou botão). */
export function AmberHint({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300">{children}</p>
  );
}

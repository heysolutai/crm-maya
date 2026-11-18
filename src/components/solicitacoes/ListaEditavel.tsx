'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  id: string;
  itens: string[];
  onChange: (itens: string[]) => void;
  placeholder: string;
  max: number;
  /** Texto entre aspas (exemplos de frases). */
  aspas?: boolean;
  disabled?: boolean;
}

/** Lista curta editável em "pílulas": digita, Enter (ou Adicionar) inclui, X tira. */
export function ListaEditavel({ id, itens, onChange, placeholder, max, aspas, disabled }: Props) {
  const [texto, setTexto] = useState('');
  const cheia = itens.length >= max;

  const adicionar = () => {
    const v = texto.trim();
    if (!v || cheia) return;
    if (!itens.some((i) => i.toLowerCase() === v.toLowerCase())) onChange([...itens, v]);
    setTexto('');
  };

  return (
    <div className="space-y-2">
      {itens.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {itens.map((item) => (
            <li
              key={item}
              className="inline-flex max-w-full items-center gap-1 rounded-full border bg-background px-2.5 py-0.5 text-xs"
            >
              <span className="truncate">{aspas ? `“${item}”` : item}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(itens.filter((i) => i !== item))}
                  className="-mr-1 shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Tirar ${item}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <div className="flex gap-2">
          <Input
            id={id}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                adicionar();
              }
            }}
            placeholder={cheia ? `Máximo de ${max}` : placeholder}
            disabled={cheia}
            autoComplete="off"
          />
          <Button type="button" variant="outline" className="shrink-0" onClick={adicionar} disabled={!texto.trim() || cheia}>
            <Plus className="mr-1.5 h-4 w-4" />
            Adicionar
          </Button>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { telefone } from './formatos';

interface Props {
  id: string;
  numeros: string[];
  onChange: (numeros: string[]) => void;
  max?: number;
  placeholder?: string;
}

function soDigitos(v: string): string {
  return v.replace(/\D/g, '');
}

/** (4 → (41 → (41) 9986 → (41) 99867-9696; com 55 na frente: +55 (41) 99867-9696. */
function mascara(valor: string): string {
  const d0 = soDigitos(valor).slice(0, 13);
  const comPais = d0.length > 11 && d0.startsWith('55');
  const d = comPais ? d0.slice(2) : d0.slice(0, 11);
  let m = '';
  if (d.length === 0) m = '';
  else if (d.length <= 2) m = `(${d}`;
  else if (d.length <= 6) m = `(${d.slice(0, 2)}) ${d.slice(2)}`;
  else {
    const corte = d.length === 11 ? 7 : 6;
    m = `(${d.slice(0, 2)}) ${d.slice(2, corte)}-${d.slice(corte)}`;
  }
  return comPais ? `+55 ${m}` : m;
}

/** Chave para comparar: sem 55 e sem o nono dígito. */
function chave(n: string): string {
  let d = soDigitos(n);
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3);
  return d;
}

/** Lista de WhatsApp da equipe: máscara ao digitar, Enter adiciona, X tira. */
export function ListaTelefones({ id, numeros, onChange, max = 20, placeholder = '(41) 99867-9696' }: Props) {
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const digitos = soDigitos(texto);

  const adicionar = () => {
    if (!digitos) return;
    if (digitos.length < 10 || digitos.length > 13) return setErro('Número inválido: use DDD + número.');
    if (numeros.some((n) => chave(n) === chave(digitos))) return setErro('Este número já está na lista.');
    if (numeros.length >= max) return setErro(`No máximo ${max} números.`);
    onChange([...numeros, digitos]);
    setTexto('');
    setErro(null);
  };

  return (
    <div className="space-y-2">
      {numeros.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {numeros.map((n) => (
            <li key={n} className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium tabular-nums">
              {telefone(n)}
              <button
                type="button"
                onClick={() => onChange(numeros.filter((x) => x !== n))}
                className="-mr-1 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Tirar ${telefone(n)}`}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          id={id}
          value={texto}
          onChange={(e) => {
            setTexto(mascara(e.target.value));
            setErro(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              adicionar();
            }
          }}
          placeholder={placeholder}
          inputMode="tel"
          autoComplete="off"
          aria-invalid={!!erro}
        />
        <Button type="button" variant="outline" className="shrink-0" onClick={adicionar} disabled={!digitos}>
          <Plus className="mr-1.5 h-4 w-4" />
          Adicionar
        </Button>
      </div>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}

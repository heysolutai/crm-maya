'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api/client';
import { cn } from '@/lib/utils';

interface Servidor {
  nome: string;
  url: string;
  padrao: boolean;
}

interface Props {
  id: string;
  value: string;
  onChange: (url: string) => void;
  /** Super-admin criando a conexão de um restaurante (assistente de configuração). */
  companyId?: string;
}

/** https + host com ponto. O servidor confere de verdade (e bloqueia rede interna). */
export function servidorUazapiValido(url: string): boolean {
  return /^https:\/\/[^\s/]+\.[^\s]+$/.test(url.trim());
}

/**
 * "Servidor" do "Usar token existente": já vem com o padrão (Heysolut) e tem
 * atalhos pros servidores conhecidos (ex.: NicoChat). Dá pra colar outro.
 */
export function ServidorUazapiField({ id, value, onChange, companyId }: Props) {
  const { data: servidores = [] } = useQuery({
    queryKey: ['uazapi-servidores', companyId ?? null],
    queryFn: async (): Promise<Servidor[]> => {
      const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
      const res = await apiFetch(`/api/channels/uazapi/servidores${qs}`);
      if (!res.ok) return [];
      const json = (await res.json()) as { servidores?: Servidor[] };
      return json.servidores ?? [];
    },
    staleTime: Infinity,
  });

  // Começa no padrão, sem atropelar o que a pessoa já digitou.
  const padrao = servidores.find((s) => s.padrao)?.url;
  useEffect(() => {
    if (padrao && !value) onChange(padrao);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [padrao]);

  const atual = value.trim().replace(/\/+$/, '');
  const invalido = value.trim() !== '' && !servidorUazapiValido(value);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Servidor</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://seuservidor.uazapi.com"
        className="font-mono text-sm"
        spellCheck={false}
        autoComplete="off"
      />
      {servidores.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {servidores.map((s) => (
            <button
              key={s.url}
              type="button"
              aria-pressed={atual === s.url}
              onClick={() => onChange(s.url)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                atual === s.url
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
              )}
            >
              {s.nome}
              {s.padrao ? ' (padrão)' : ''}
            </button>
          ))}
        </div>
      )}
      <p className={cn('text-xs', invalido ? 'text-destructive' : 'text-muted-foreground')}>
        {invalido ? 'Use o endereço completo, começando com https://' : 'Servidor UAZAPI onde a instância foi criada.'}
      </p>
    </div>
  );
}

'use client';

import { AlertCircle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIntegrationFailures } from './hooks';

function formatarHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * Como a IA está usando esta integração (últimas 24h, todos os restaurantes):
 * quantas chamadas deram certo e cada falha explicada, com o texto técnico.
 * Depois de trocar endereço ou chave, é aqui que se vê se voltou.
 */
export function FailuresPanel({ integrationId }: { integrationId: string }) {
  const { data, isLoading, isError } = useIntegrationFailures(integrationId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando...
      </div>
    );
  }
  if (isError || !data) return <p className="text-sm text-destructive">Não foi possível carregar o uso da integração.</p>;

  const semUso = data.deramCerto === 0 && data.totalFalhas === 0 && data.normais === 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          {data.deramCerto} {data.deramCerto === 1 ? 'chamada deu certo' : 'chamadas deram certo'}
        </span>
        <span className={cn('flex items-center gap-1.5', data.totalFalhas ? 'text-destructive' : 'text-muted-foreground')}>
          <XCircle className="h-4 w-4" />
          {data.totalFalhas} {data.totalFalhas === 1 ? 'falha' : 'falhas'}
        </span>
        {data.normais > 0 && (
          <span className="text-muted-foreground">
            · {data.normais} {data.normais === 1 ? 'recusa normal' : 'recusas normais'} (faltou dado, sem vaga...)
          </span>
        )}
      </div>

      {semUso ? (
        <p className="rounded-xl border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
          A IA não usou esta integração nas últimas 24h.
        </p>
      ) : data.falhas.length > 0 ? (
        <ul className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/40">
          {data.falhas.map((f) => (
            <li key={f.id} className="space-y-1 p-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <AlertCircle
                  className={cn(
                    'h-4 w-4 shrink-0',
                    f.explicacao.nivel === 'problema' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'
                  )}
                />
                <span className="text-sm font-medium">{f.explicacao.titulo}</span>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">{formatarHora(f.createdAt)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {f.empresa} · {f.ferramenta} <span className="font-mono">({f.toolName})</span>
              </p>
              {f.erro && (
                <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded bg-destructive/10 p-1.5 font-mono text-[11px] text-destructive">
                  {f.httpStatus ? `HTTP ${f.httpStatus} · ` : ''}
                  {f.erro}
                </pre>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

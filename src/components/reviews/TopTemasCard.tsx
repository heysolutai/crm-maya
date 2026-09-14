'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { useReviewTemas, type PeriodoTemas, type TemaAvaliacao } from '@/hooks/useReviews';
import { cn } from '@/lib/utils';

const PERIODOS: Array<{ key: PeriodoTemas; label: string }> = [
  { key: 'dia', label: 'Dia' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mês' },
];

function Coluna({
  titulo,
  icone,
  itens,
  cor,
  vazio,
}: {
  titulo: string;
  icone: React.ReactNode;
  itens: TemaAvaliacao[];
  cor: string;
  vazio: string;
}) {
  const max = Math.max(1, ...itens.map((i) => i.total));
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        {icone}
        {titulo}
      </div>
      {itens.length === 0 ? (
        <p className="text-xs text-muted-foreground">{vazio}</p>
      ) : (
        itens.map((t, i) => (
          <div key={t.tema} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {i + 1}. {t.tema}
              </span>
              <span className="tabular-nums text-muted-foreground">{t.total}</span>
            </div>
            <div className="h-1.5 rounded bg-muted">
              <div className={cn('h-1.5 rounded', cor)} style={{ width: `${(t.total / max) * 100}%` }} />
            </div>
            {t.exemplos[0] && (
              <p className="text-xs text-muted-foreground italic line-clamp-2">&ldquo;{t.exemplos[0]}&rdquo;</p>
            )}
          </div>
        ))
      )}
    </div>
  );
}

/**
 * O que os clientes mais elogiam e do que mais reclamam, no dia, na semana ou
 * no mês. Os comentários são agrupados por tema (atendimento, comida, espera,
 * preço, ambiente...) no servidor.
 */
export function TopTemasCard() {
  const [periodo, setPeriodo] = useState<PeriodoTemas>('semana');
  const { data, isLoading } = useReviewTemas(periodo);

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Top 5 elogios e reclamações</h2>
            <p className="text-xs text-muted-foreground">
              {data
                ? `${data.totalComComentario} comentário(s) em ${data.totalAvaliacoes} avaliação(ões) no período`
                : 'Temas mais citados nos comentários dos clientes'}
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-md border p-0.5">
            {PERIODOS.map((p) => (
              <Button
                key={p.key}
                size="sm"
                variant={periodo === p.key ? 'default' : 'ghost'}
                className="h-7 px-3 text-xs"
                onClick={() => setPeriodo(p.key)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        {isLoading || !data ? (
          <div className="grid gap-6 sm:grid-cols-2">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            <Coluna
              titulo="Elogios"
              icone={<ThumbsUp className="h-4 w-4 text-emerald-600" />}
              itens={data.elogios}
              cor="bg-emerald-500"
              vazio="Nenhum elogio com comentário neste período."
            />
            <Coluna
              titulo="Reclamações"
              icone={<ThumbsDown className="h-4 w-4 text-red-600" />}
              itens={data.reclamacoes}
              cor="bg-red-500"
              vazio="Nenhuma reclamação com comentário neste período."
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

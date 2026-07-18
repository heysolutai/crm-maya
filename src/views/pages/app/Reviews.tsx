'use client';

import { useState } from 'react';
import { useReviews } from '@/hooks/useReviews';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Star, Search, Trash2, MessageSquareQuote, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const RATING_FILTERS = [5, 4, 3, 2, 1];

/** Estrelas preenchidas conforme a nota. */
function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} de 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            'h-3.5 w-3.5',
            i < rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'
          )}
        />
      ))}
    </div>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  ai: 'IA',
  agent: 'Atendente',
  manual: 'Manual',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Reviews() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });

  const { reviews, pagination, summary, isLoading, deleteReview, isDeleting } = useReviews({
    page,
    rating: ratingFilter,
    search,
  });

  const applySearch = () => {
    setSearch(searchInput.trim());
    setPage(1);
  };

  const toggleRating = (r: number) => {
    setRatingFilter((cur) => (cur === r ? null : r));
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Star className="h-7 w-7" />
            Avaliações
          </h1>
          <p className="text-muted-foreground mt-1">
            Notas e comentários dos clientes sobre o atendimento
          </p>
        </div>

        {summary && summary.total > 0 && (
          <Card className="shrink-0">
            <CardContent className="py-3 px-5">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Média geral</p>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold tabular-nums">
                      {summary.average?.toFixed(1) ?? '—'}
                    </span>
                    {summary.average != null && <Stars rating={Math.round(summary.average)} />}
                  </div>
                </div>
                <div className="border-l pl-4">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold tabular-nums">{summary.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Buscar por nome ou comentário..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applySearch()}
            className="w-[280px]"
          />
          <Button variant="outline" size="icon" onClick={applySearch}>
            <Search className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          {RATING_FILTERS.map((r) => (
            <Button
              key={r}
              type="button"
              size="sm"
              variant={ratingFilter === r ? 'default' : 'outline'}
              onClick={() => toggleRating(r)}
              className="gap-1 px-2.5"
            >
              {r}
              <Star
                className={cn(
                  'h-3 w-3',
                  ratingFilter === r ? 'fill-current' : 'fill-amber-400 text-amber-400'
                )}
              />
            </Button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[130px]">Nota</TableHead>
                <TableHead className="w-[200px]">Cliente</TableHead>
                <TableHead>Comentário</TableHead>
                <TableHead className="w-[110px]">Origem</TableHead>
                <TableHead className="w-[160px]">Data</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : reviews.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <MessageSquareQuote className="h-8 w-8 opacity-40" />
                      <p className="text-sm">
                        {search || ratingFilter
                          ? 'Nenhuma avaliação encontrada com esses filtros.'
                          : 'Nenhuma avaliação registrada ainda.'}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                reviews.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums">{r.rating}</span>
                        <Stars rating={r.rating} />
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.customerName || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="max-w-[420px]">
                      {r.comment ? (
                        <span className="line-clamp-2 text-sm">{r.comment}</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">Sem comentário</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">
                        {SOURCE_LABELS[r.source] || r.source}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(r.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setConfirmDelete({ open: true, id: r.id })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Paginação */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {pagination.page} de {pagination.totalPages} · {pagination.total} avaliações
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete.open}
        onOpenChange={(open) => setConfirmDelete({ open, id: open ? confirmDelete.id : null })}
        title="Remover avaliação"
        description="Esta ação não pode ser desfeita. A avaliação será removida permanentemente."
        confirmLabel="Remover"
        variant="destructive"
        isLoading={isDeleting}
        onConfirm={() => {
          if (confirmDelete.id) deleteReview(confirmDelete.id);
          setConfirmDelete({ open: false, id: null });
        }}
      />
    </div>
  );
}

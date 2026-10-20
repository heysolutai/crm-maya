'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  MessageSquareText,
  RefreshCw,
  ScrollText,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CardListSkeleton } from '@/components/ui/table-skeleton';
import { RegistroItem } from '@/components/ai-registro/RegistroItem';
import { RegistroIAErro, useRegistroIA } from '@/components/ai-registro/useRegistroIA';
import type { FiltroRegistro } from '@/components/ai-registro/types';
import { useInboxes } from '@/hooks/useInboxes';
import { cn } from '@/lib/utils';

const FILTROS: { valor: FiltroRegistro; rotulo: string }[] = [
  { valor: 'todos', rotulo: 'Todas' },
  { valor: 'problemas', rotulo: 'Problemas' },
  { valor: 'nao_respondidas', rotulo: 'Não respondidas' },
  { valor: 'respondidas', rotulo: 'Respondidas' },
];

const VAZIO: Record<FiltroRegistro, { icone: LucideIcon; titulo: string; descricao: string }> = {
  todos: {
    icone: ScrollText,
    titulo: 'Nada registrado ainda',
    descricao: 'Quando um cliente mandar mensagem, você vê aqui o que a IA fez com ela.',
  },
  problemas: {
    icone: CheckCircle2,
    titulo: 'Nenhum problema',
    descricao: 'Nenhuma mensagem de cliente ficou com problema. Está tudo certo por aqui.',
  },
  nao_respondidas: {
    icone: CheckCircle2,
    titulo: 'Nenhuma mensagem sem resposta',
    descricao: 'A IA respondeu todas as mensagens dos clientes (ou ainda está respondendo).',
  },
  respondidas: {
    icone: MessageSquareText,
    titulo: 'Nenhuma mensagem respondida',
    descricao: 'Quando a IA responder um cliente, a mensagem aparece aqui.',
  },
};

const TODAS_CONEXOES = 'todas';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ehFiltro(v: string | null): v is FiltroRegistro {
  return FILTROS.some((f) => f.valor === v);
}

/**
 * Registro da IA: cada mensagem dos clientes, o que a IA fez com ela, por quê
 * e o que fazer quando algo deu errado. Só o administrador vê.
 *
 * Aceita `?filtro=problemas` e `?inboxId=` no endereço (link "Ver quais" do
 * painel Situação) como filtro inicial.
 */
export default function AiRegistro() {
  const [filtro, setFiltro] = useState<FiltroRegistro>('todos');
  const [inboxId, setInboxId] = useState<string | null>(null);
  // Lê o endereço no efeito (não useSearchParams) para não exigir Suspense na página;
  // a busca espera essa leitura para não carregar "Todas" à toa.
  const [filtroLido, setFiltroLido] = useState(false);
  const { inboxes } = useInboxes();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const f = params.get('filtro');
    if (ehFiltro(f)) setFiltro(f);
    const i = params.get('inboxId');
    if (i && UUID_RE.test(i)) setInboxId(i);
    setFiltroLido(true);
  }, []);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    isFetchingNextPage,
    isFetchNextPageError,
    hasNextPage,
    fetchNextPage,
  } = useRegistroIA(filtro, inboxId, filtroLido);

  const itens = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const variasConexoes = inboxes.length > 1;
  const semPermissao = error instanceof RegistroIAErro && error.status === 403;
  const atualizando = isFetching && !isFetchingNextPage && !isLoading;
  const vazio = VAZIO[filtro];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
            <ScrollText className="h-7 w-7 shrink-0 text-primary" />
            Registro da IA
          </h1>
          <p className="mt-1 text-muted-foreground">Cada mensagem dos clientes e o que a IA fez com ela.</p>
        </div>
        {!semPermissao && (
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('mr-2 h-4 w-4', atualizando && 'animate-spin')} />
            Atualizar
          </Button>
        )}
      </div>

      {semPermissao ? (
        <EmptyState
          icon={ShieldAlert}
          title="Acesso restrito"
          description="Só o administrador do restaurante pode ver o registro da IA."
          className="rounded-lg border border-dashed"
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div
              role="group"
              aria-label="Filtrar mensagens"
              className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:inline-flex sm:w-auto"
            >
              {FILTROS.map((f) => {
                const ativo = filtro === f.valor;
                return (
                  <button
                    key={f.valor}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => setFiltro(f.valor)}
                    className={cn(
                      'min-h-9 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      ativo
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                    )}
                  >
                    {f.rotulo}
                  </button>
                );
              })}
            </div>

            {variasConexoes && (
              <Select
                value={inboxId ?? TODAS_CONEXOES}
                onValueChange={(v) => setInboxId(v === TODAS_CONEXOES ? null : v)}
              >
                <SelectTrigger className="w-full sm:w-64" aria-label="Conexão do WhatsApp">
                  <SelectValue placeholder="Todas as conexões" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS_CONEXOES}>Todas as conexões</SelectItem>
                  {inboxes.map((inbox) => (
                    <SelectItem key={inbox.id} value={inbox.id}>
                      {inbox.display_name || inbox.instance_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {isLoading || !filtroLido ? (
            <CardListSkeleton count={5} />
          ) : isError && itens.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">Não foi possível carregar o registro da IA.</p>
              <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Tentar de novo
              </Button>
            </div>
          ) : itens.length === 0 ? (
            <EmptyState
              icon={vazio.icone}
              title={vazio.titulo}
              description={
                inboxId
                  ? 'Nada para mostrar nesta conexão. Escolha "Todas as conexões" para ver as outras.'
                  : vazio.descricao
              }
              className="rounded-lg border border-dashed"
            />
          ) : (
            <div className="space-y-3">
              <ul className="space-y-3">
                {itens.map((item) => (
                  <RegistroItem key={item.id} item={item} mostrarConexao={variasConexoes} />
                ))}
              </ul>

              <div className="flex flex-col items-center gap-2 pt-2">
                {hasNextPage ? (
                  <>
                    <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                      {isFetchingNextPage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Carregar mais
                    </Button>
                    {isFetchNextPageError && (
                      <p className="text-sm text-destructive">Não foi possível carregar mais. Tente de novo.</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {itens.length === 1 ? '1 mensagem' : `${itens.length} mensagens`} · não há mais nada para carregar
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

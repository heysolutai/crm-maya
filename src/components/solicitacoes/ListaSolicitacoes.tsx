'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { CardSolicitacao } from '@/hooks/useSolicitacoes';
import type { Etapa, Funil } from '@/lib/solicitacoes/funis';
import { cn } from '@/lib/utils';
import { BotaoWhatsApp } from './BotaoWhatsApp';
import { corDaEtapa } from './cores';
import { emReais, haQuanto, iniciais, telefone, valorDoDado } from './formatos';
import { Origem, Situacao } from './QuadroKanban';

interface Props {
  funil: Funil;
  etapas: Etapa[];
  itens: CardSolicitacao[];
  onAbrir: (id: string) => void;
}

/** As solicitações em tabela: uma linha por pedido, clique abre o detalhe. */
export function ListaSolicitacoes({ funil, etapas, itens, onAbrir }: Props) {
  const rotuloEtapa = (k: string) => etapas.find((e) => e.key === k)?.label ?? k;

  if (!itens.length) {
    return (
      <div className="rounded-2xl border border-dashed py-16 text-center text-sm text-muted-foreground">
        Nenhuma solicitação neste período.
      </div>
    );
  }

  const cab = 'h-11 text-xs font-semibold uppercase tracking-wide text-muted-foreground';

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(cab, 'min-w-[230px]')}>Cliente</TableHead>
              <TableHead className={cn(cab, 'min-w-[140px]')}>Etapa</TableHead>
              <TableHead className={cn(cab, 'min-w-[280px]')}>Pedido</TableHead>
              {funil === 'eventos' && <TableHead className={cn(cab, 'min-w-[130px]')}>Data · Pessoas</TableHead>}
              {funil === 'eventos' && <TableHead className={cn(cab, 'min-w-[110px] text-right')}>Valor</TableHead>}
              <TableHead className={cn(cab, 'min-w-[130px]')}>Situação</TableHead>
              <TableHead className={cn(cab, 'min-w-[140px]')}>Responsável</TableHead>
              <TableHead className={cn(cab, 'w-12')}>
                <span className="sr-only">WhatsApp</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((c) => {
              const etapa = corDaEtapa(c.stage);
              const nome = c.customerName || telefone(c.customerPhone) || 'Cliente';
              const tipo = c.data['Tipo de evento'];
              const data = c.data['Data'];
              const pessoas = c.data['Número de pessoas'];
              return (
                <TableRow
                  key={c.id}
                  onClick={() => onAbrir(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onAbrir(c.id);
                  }}
                  tabIndex={0}
                  className="cursor-pointer focus-visible:bg-muted/60 focus-visible:outline-none"
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold', etapa.avatar)}>
                        {iniciais(nome)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold">{nome}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {funil === 'eventos' && tipo ? String(tipo) : c.category} · {haQuanto(c.createdAt)}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', etapa.pilula)}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', etapa.ponto)} />
                      {rotuloEtapa(c.stage)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <p className="line-clamp-2 text-sm text-foreground/75">{c.summary || '—'}</p>
                  </TableCell>
                  {funil === 'eventos' && (
                    <TableCell className="text-sm text-muted-foreground">
                      {data != null ? valorDoDado(data) : '—'}
                      {pessoas != null && ` · ${pessoas}`}
                    </TableCell>
                  )}
                  {funil === 'eventos' && (
                    <TableCell className="text-right text-sm font-semibold tabular-nums">
                      {c.estimatedValue != null ? emReais(c.estimatedValue) : '—'}
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <Situacao card={c} />
                      <Origem origin={c.origin} />
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.assignedTo ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                          {iniciais(c.assignedTo.name)}
                        </span>
                        <span className="truncate">{c.assignedTo.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Ninguém</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <BotaoWhatsApp solicitacaoId={c.id} conversationId={c.conversationId} telefone={c.customerPhone} clientId={c.clientId} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

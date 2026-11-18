'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Bot, CalendarDays, CheckCircle2, Clock, UserRound, Users } from 'lucide-react';
import type { CardSolicitacao } from '@/hooks/useSolicitacoes';
import type { Etapa, Funil } from '@/lib/solicitacoes/funis';
import { cn } from '@/lib/utils';
import { BotaoWhatsApp } from './BotaoWhatsApp';
import { NEON, NEON_HOVER, corDaEtapa } from './cores';
import { emReais, haQuanto, iniciais, telefone, valorDoDado } from './formatos';

interface Props {
  funil: Funil;
  etapas: Etapa[];
  itens: CardSolicitacao[];
  onAbrir: (id: string) => void;
  onMover: (id: string, etapa: string) => void;
}

/** Situação do atendimento: sem resposta (âmbar) ou já atendida (verde). */
export function Situacao({ card }: { card: CardSolicitacao }) {
  if (card.closedAt) return null;
  if (!card.firstResponseAt) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
        <Clock className="h-3.5 w-3.5" />
        Sem resposta
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="h-3.5 w-3.5" />
      Atendida
    </span>
  );
}

export function Origem({ origin }: { origin: string }) {
  const equipe = origin === 'atendente';
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      {equipe ? <UserRound className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      {equipe ? 'Equipe' : origin === 'sistema' ? 'Automático' : origin === 'sistema_reservas' ? 'Reserve Maya' : 'IA'}
    </span>
  );
}

function ConteudoCard({ card, funil, arrastando }: { card: CardSolicitacao; funil: Funil; arrastando?: boolean }) {
  const tipo = card.data['Tipo de evento'];
  const data = card.data['Data'];
  const pessoas = card.data['Número de pessoas'];
  const nome = card.customerName || telefone(card.customerPhone) || 'Cliente';
  const tom = corDaEtapa(card.stage);

  return (
    <div
      className={cn(
        'space-y-3 rounded-xl border bg-card p-4 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
        arrastando ? cn(NEON, 'rotate-1') : NEON_HOVER
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold', tom.avatar)}>
          {iniciais(nome)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight">{nome}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {funil === 'eventos' && tipo ? String(tipo) : card.category} · {haQuanto(card.createdAt)}
          </p>
        </div>
        <BotaoWhatsApp
          solicitacaoId={card.id}
          conversationId={card.conversationId}
          telefone={card.customerPhone}
          clientId={card.clientId}
          className="-mr-1 -mt-1"
        />
      </div>

      {card.summary && <p className="line-clamp-2 text-sm leading-snug text-foreground/75">{card.summary}</p>}

      {funil === 'eventos' && (data != null || pessoas != null || card.estimatedValue != null) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
          {data != null && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" />
              {valorDoDado(data)}
            </span>
          )}
          {pessoas != null && (
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              {pessoas}
            </span>
          )}
          {card.estimatedValue != null && <span className="ml-auto font-semibold text-foreground">{emReais(card.estimatedValue)}</span>}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
        <div className="flex min-w-0 items-center gap-3">
          <Origem origin={card.origin} />
          <Situacao card={card} />
        </div>
        {card.assignedTo && (
          <span
            title={`Responsável: ${card.assignedTo.name}`}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary"
          >
            {iniciais(card.assignedTo.name)}
          </span>
        )}
      </div>
    </div>
  );
}

function CardArrastavel({ card, funil, onAbrir }: { card: CardSolicitacao; funil: Funil; onAbrir: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  return (
    <div
      ref={setNodeRef}
      // attributes do dnd-kit já trazem role="button" e tabIndex.
      {...attributes}
      {...listeners}
      onClick={() => onAbrir(card.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onAbrir(card.id);
      }}
      className={cn('block w-full cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40', isDragging && 'opacity-30')}
      aria-label={`Abrir solicitação de ${card.customerName || 'cliente'}`}
    >
      <ConteudoCard card={card} funil={funil} />
    </div>
  );
}

function Coluna({ etapa, funil, cards, onAbrir }: { etapa: Etapa; funil: Funil; cards: CardSolicitacao[]; onAbrir: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.key });
  const cor = corDaEtapa(etapa.key);
  const total = funil === 'eventos' ? cards.reduce((s, c) => s + (c.estimatedValue ?? 0), 0) : 0;

  return (
    <div className="flex w-[300px] shrink-0 flex-col sm:w-[320px]">
      <div className="mb-3 flex items-end justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn('h-2 w-2 shrink-0 rounded-full', cor.ponto)} />
          <h3 className="truncate text-base font-semibold">{etapa.label}</h3>
          <span className="text-sm font-medium tabular-nums text-muted-foreground">{cards.length}</span>
        </div>
        {funil === 'eventos' && total > 0 && <span className="text-[13px] font-medium tabular-nums text-muted-foreground">{emReais(total)}</span>}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-[440px] flex-1 flex-col gap-3 rounded-2xl border border-transparent p-2.5 transition-[border-color,box-shadow,background-color]',
          isOver ? cn('bg-primary/[0.03]', NEON) : cor.coluna
        )}
      >
        {cards.map((c) => (
          <CardArrastavel key={c.id} card={c} funil={funil} onAbrir={onAbrir} />
        ))}
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            Arraste um card para cá
          </div>
        )}
      </div>
    </div>
  );
}

/** Quadro do funil: arrastar o card muda a etapa; clicar abre o detalhe. */
export function QuadroKanban({ funil, etapas, itens, onAbrir, onMover }: Props) {
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);
  const sensors = useSensors(
    // Distância mínima: clique simples abre o card em vez de arrastar.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } })
  );

  const porEtapa = useMemo(() => {
    const mapa = new Map<string, CardSolicitacao[]>(etapas.map((e) => [e.key, []]));
    for (const c of itens) mapa.get(c.stage)?.push(c);
    return mapa;
  }, [etapas, itens]);

  const arrastando = arrastandoId ? itens.find((i) => i.id === arrastandoId) ?? null : null;

  const aoSoltar = (e: DragEndEvent) => {
    setArrastandoId(null);
    const destino = e.over?.id ? String(e.over.id) : null;
    const card = itens.find((i) => i.id === String(e.active.id));
    if (card && destino && destino !== card.stage) onMover(card.id, destino);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => setArrastandoId(String(e.active.id))}
      onDragEnd={aoSoltar}
      onDragCancel={() => setArrastandoId(null)}
    >
      <div className="-mx-4 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0">
        <div className="flex gap-5">
          {etapas.map((etapa) => (
            <Coluna key={etapa.key} etapa={etapa} funil={funil} cards={porEtapa.get(etapa.key) ?? []} onAbrir={onAbrir} />
          ))}
        </div>
      </div>
      <DragOverlay>{arrastando ? <ConteudoCard card={arrastando} funil={funil} arrastando /> : null}</DragOverlay>
    </DndContext>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';
import { cn } from '@/lib/utils';
import type { ItemSituacao, NivelSituacao, SituacaoResposta } from './types';

/** Quantos itens aparecem antes de "Ver todos". */
const VISIVEIS = 3;

const ESTILO: Record<NivelSituacao, { icone: LucideIcon; cor: string; borda: string; card: string }> = {
  problema: {
    icone: AlertCircle,
    cor: 'text-red-600 dark:text-red-400',
    borda: 'border-red-500/30',
    card: 'border-red-500/40 bg-red-500/[0.04] dark:bg-red-500/[0.08]',
  },
  aviso: {
    icone: AlertTriangle,
    cor: 'text-amber-600 dark:text-amber-400',
    borda: 'border-amber-500/30',
    card: 'border-amber-500/40 bg-amber-500/[0.05] dark:bg-amber-500/[0.08]',
  },
};

function tituloDoCard(problemas: number, avisos: number): string {
  if (problemas > 0) {
    return problemas === 1 ? 'Um problema precisa da sua atenção' : `${problemas} problemas precisam da sua atenção`;
  }
  return avisos === 1 ? 'Um ponto para conferir' : `${avisos} pontos para conferir`;
}

function Item({
  item,
  mostrarTecnico,
  paginaAtual,
}: {
  item: ItemSituacao;
  mostrarTecnico: boolean;
  paginaAtual: string | null;
}) {
  const estilo = ESTILO[item.nivel] ?? ESTILO.aviso;
  const Icone = estilo.icone;
  // Botão que levaria para a própria tela não ajuda: o "O que fazer" já explica onde mexer.
  const acao = item.acao && item.acao.href.split('?')[0] !== paginaAtual ? item.acao : null;

  return (
    <li className={cn('rounded-lg border bg-background/70 p-3 sm:p-4', estilo.borda)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Icone className={cn('mt-0.5 h-5 w-5 shrink-0', estilo.cor)} aria-hidden />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="font-semibold leading-snug">{item.titulo}</p>
            <p className="text-sm leading-snug text-muted-foreground">{item.detalhe}</p>
            <p className="text-sm leading-snug">
              <span className="font-semibold">O que fazer: </span>
              {item.oQueFazer}
            </p>
            {mostrarTecnico && (
              <p className="break-all font-mono text-[11px] leading-snug text-muted-foreground">
                {item.id}
                {item.tecnico ? ` · ${item.tecnico}` : ''}
              </p>
            )}
          </div>
        </div>
        {acao && (
          <Button
            asChild
            size="sm"
            variant={item.nivel === 'problema' ? 'default' : 'outline'}
            className="w-full shrink-0 sm:w-auto"
          >
            <Link href={acao.href}>
              {acao.label}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Link>
          </Button>
        )}
      </div>
    </li>
  );
}

interface Props {
  /** Só este WhatsApp (aba "Agente de IA"). Sem valor: o restaurante todo. */
  inboxId?: string;
  className?: string;
}

/**
 * Painel "Situação": mostra, em palavras simples, o que está impedindo a IA ou
 * o WhatsApp de atender, o que fazer e um botão que leva até lá. Tudo certo =
 * uma linha verde. Atualiza sozinho a cada minuto.
 */
export function SituacaoCard({ inboxId, className }: Props) {
  const { effectiveCompanyId } = useEffectiveCompanyId();
  const { isSuperAdmin } = useAuth();
  const pathname = usePathname();
  const [todos, setTodos] = useState(false);

  const { data } = useQuery({
    queryKey: ['ai-health', effectiveCompanyId, inboxId ?? 'todas'],
    queryFn: async (): Promise<SituacaoResposta> => {
      const params = new URLSearchParams();
      if (inboxId) params.set('inboxId', inboxId);
      const qs = params.toString();
      const res = await apiFetch(`/api/ai-health${qs ? `?${qs}` : ''}`);
      if (!res.ok) throw new Error('Falha ao verificar a situação');
      return (await res.json()) as SituacaoResposta;
    },
    enabled: !!effectiveCompanyId,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });

  // Carregando ou sem resposta: não mostra nada (o painel nunca atrapalha a tela).
  if (!data) return null;

  if (data.status === 'ok' || data.itens.length === 0) {
    return (
      <div
        role="status"
        className={cn('flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400', className)}
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
        Tudo funcionando
      </div>
    );
  }

  const problemas = data.itens.filter((i) => i.nivel === 'problema').length;
  const avisos = data.itens.length - problemas;
  const nivel: NivelSituacao = problemas > 0 ? 'problema' : 'aviso';
  const estilo = ESTILO[nivel];
  const Icone = estilo.icone;
  const visiveis = todos ? data.itens : data.itens.slice(0, VISIVEIS);
  const verificado = new Date(data.verificadoEm);

  return (
    <section
      aria-label="Situação do atendimento"
      className={cn('rounded-xl border p-3 text-card-foreground sm:p-4', estilo.card, className)}
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
          <Icone className={cn('h-5 w-5 shrink-0', estilo.cor)} aria-hidden />
          {tituloDoCard(problemas, avisos)}
        </h2>
        {problemas > 0 && avisos > 0 && (
          <span className="text-sm text-muted-foreground">
            {avisos === 1 ? 'e 1 ponto para conferir' : `e ${avisos} pontos para conferir`}
          </span>
        )}
        {!Number.isNaN(verificado.getTime()) && (
          <span className="text-xs text-muted-foreground sm:ml-auto">verificado às {format(verificado, 'HH:mm')}</span>
        )}
      </div>

      <ul className="space-y-2">
        {visiveis.map((item) => (
          <Item key={item.id} item={item} mostrarTecnico={isSuperAdmin} paginaAtual={pathname} />
        ))}
      </ul>

      {data.itens.length > VISIVEIS && (
        <button
          type="button"
          onClick={() => setTodos((v) => !v)}
          aria-expanded={todos}
          className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-md px-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {todos ? 'Mostrar menos' : `Ver todos (${data.itens.length})`}
          <ChevronDown className={cn('h-4 w-4 transition-transform', todos && 'rotate-180')} aria-hidden />
        </button>
      )}
    </section>
  );
}

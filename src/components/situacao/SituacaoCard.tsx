'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api/client';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';
import { cn } from '@/lib/utils';
import type { ItemSituacao, NivelSituacao, SituacaoResposta } from './types';

/** Quantos itens aparecem antes de "Ver todos". */
const VISIVEIS = 3;

const ESTILO: Record<NivelSituacao, { icone: LucideIcon; cor: string; fundoIcone: string; card: string }> = {
  problema: {
    icone: AlertCircle,
    cor: 'text-red-600 dark:text-red-400',
    fundoIcone: 'bg-red-500/10',
    card: 'border-red-500/40 bg-red-500/[0.04] dark:bg-red-500/[0.08]',
  },
  aviso: {
    icone: AlertTriangle,
    cor: 'text-amber-600 dark:text-amber-400',
    fundoIcone: 'bg-amber-500/10',
    card: 'border-amber-500/40 bg-amber-500/[0.05] dark:bg-amber-500/[0.08]',
  },
};

function tituloDoCard(problemas: number, avisos: number): string {
  if (problemas > 0) {
    return problemas === 1 ? 'Um problema precisa da sua atenção' : `${problemas} problemas precisam da sua atenção`;
  }
  return avisos === 1 ? 'Um ponto para conferir' : `${avisos} pontos para conferir`;
}

/**
 * Um item: o que está errado e por quê (sempre à vista), o botão que resolve
 * alinhado à direita e o passo a passo em "O que fazer?".
 */
function Item({ item, paginaAtual }: { item: ItemSituacao; paginaAtual: string | null }) {
  const [aberto, setAberto] = useState(false);
  const estilo = ESTILO[item.nivel] ?? ESTILO.aviso;
  const Icone = estilo.icone;
  // Botão que levaria para a própria tela não ajuda: o "O que fazer" já explica onde mexer.
  const acao = item.acao && item.acao.href.split('?')[0] !== paginaAtual ? item.acao : null;

  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', estilo.fundoIcone)}>
          <Icone className={cn('h-4 w-4', estilo.cor)} aria-hidden />
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium leading-snug">{item.titulo}</p>
          <p className="text-[13px] leading-snug text-muted-foreground">{item.detalhe}</p>
          {aberto && (
            <p className="pt-1 text-[13px] leading-snug">
              <span className="font-medium">O que fazer: </span>
              {item.oQueFazer}
            </p>
          )}
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            className="inline-flex items-center gap-1 rounded pt-0.5 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {aberto ? 'Ocultar' : 'O que fazer?'}
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', aberto && 'rotate-180')} aria-hidden />
          </button>
        </div>
      </div>
      {acao && (
        <Button asChild size="sm" variant="outline" className="ml-10 shrink-0 bg-background sm:ml-0">
          <Link href={acao.href}>{acao.label}</Link>
        </Button>
      )}
    </li>
  );
}

interface Props {
  /** Só este WhatsApp (aba "Agente de IA"). Sem valor: o restaurante todo. */
  inboxId?: string;
  /**
   * Sem nada a conferir, não mostra "Tudo funcionando". Na aba da conexão com
   * a IA desligada, o card "IA desligada" já diz a situação: o verde ali
   * soaria como se a IA estivesse atendendo.
   */
  ocultarSeOk?: boolean;
  className?: string;
}

/**
 * Painel "Situação": mostra, em palavras simples, o que está impedindo a IA ou
 * o WhatsApp de atender, com um botão que leva até lá (o detalhe abre ao
 * clicar). Tudo certo = uma linha verde. Atualiza sozinho a cada minuto.
 */
export function SituacaoCard({ inboxId, ocultarSeOk = false, className }: Props) {
  const { effectiveCompanyId } = useEffectiveCompanyId();
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
    if (ocultarSeOk) return null;
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

  return (
    <section
      aria-label="Situação do atendimento"
      className={cn('rounded-xl border p-4 text-card-foreground sm:p-5', estilo.card, className)}
    >
      <h2 className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-base font-semibold">
        <Icone className={cn('h-5 w-5 shrink-0', estilo.cor)} aria-hidden />
        {tituloDoCard(problemas, avisos)}
        {problemas > 0 && avisos > 0 && (
          <span className="text-sm font-normal text-muted-foreground">
            {avisos === 1 ? '· 1 ponto para conferir' : `· ${avisos} pontos para conferir`}
          </span>
        )}
      </h2>

      <ul className="divide-y divide-border/70">
        {visiveis.map((item) => (
          <Item key={item.id} item={item} paginaAtual={pathname} />
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

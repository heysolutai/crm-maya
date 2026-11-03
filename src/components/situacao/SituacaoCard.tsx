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

const ESTILO: Record<NivelSituacao, { icone: LucideIcon; cor: string; card: string }> = {
  problema: {
    icone: AlertCircle,
    cor: 'text-red-600 dark:text-red-400',
    card: 'border-red-500/40 bg-red-500/[0.04] dark:bg-red-500/[0.08]',
  },
  aviso: {
    icone: AlertTriangle,
    cor: 'text-amber-600 dark:text-amber-400',
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
 * Uma linha: o que está errado + o botão que resolve. O porquê e o passo a
 * passo ficam escondidos e abrem ao clicar no título.
 */
function Item({ item, paginaAtual }: { item: ItemSituacao; paginaAtual: string | null }) {
  const [aberto, setAberto] = useState(false);
  const estilo = ESTILO[item.nivel] ?? ESTILO.aviso;
  const Icone = estilo.icone;
  // Botão que levaria para a própria tela não ajuda: o "O que fazer" já explica onde mexer.
  const acao = item.acao && item.acao.href.split('?')[0] !== paginaAtual ? item.acao : null;

  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className="flex min-w-[12rem] flex-1 items-start gap-2.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icone className={cn('mt-0.5 h-4 w-4 shrink-0', estilo.cor)} aria-hidden />
          <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{item.titulo}</span>
          <ChevronDown
            className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform', aberto && 'rotate-180')}
            aria-hidden
          />
        </button>
        {acao && (
          <Button asChild size="sm" variant="outline" className="ml-[26px] h-8 shrink-0 bg-background sm:ml-0">
            <Link href={acao.href}>{acao.label}</Link>
          </Button>
        )}
      </div>

      {aberto && (
        <div className="mt-2 space-y-1 pl-[26px] text-sm leading-snug">
          <p className="text-muted-foreground">{item.detalhe}</p>
          <p>
            <span className="font-medium">O que fazer: </span>
            {item.oQueFazer}
          </p>
        </div>
      )}
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
 * o WhatsApp de atender, com um botão que leva até lá (o detalhe abre ao
 * clicar). Tudo certo = uma linha verde. Atualiza sozinho a cada minuto.
 */
export function SituacaoCard({ inboxId, className }: Props) {
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
      className={cn('rounded-xl border p-3 text-card-foreground sm:p-4', estilo.card, className)}
    >
      <h2 className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-base font-semibold">
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

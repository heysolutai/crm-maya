'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bot, ChevronDown, MessageSquare, ShieldBan, Timer, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  formatarDataHora,
  formatarTelefone,
  linkConversa,
  textoBloqueios,
  textoQuantidadeMensagens,
  textoTempoResposta,
} from './formatar';
import { classeNivel, ResultadoBadge } from './ResultadoBadge';
import type { RegistroIA } from './types';

/**
 * Texto cru gravado no registro ("erro · maestro: falha ao chamar a OpenAI"),
 * pra quem depura. Só o super-admin vê; null pra todo o resto.
 */
export function textoTecnicoDoTurno(
  turno: { status: string; motivo: string | null },
  isSuperAdmin: boolean
): string | null {
  if (!isSuperAdmin) return null;
  return turno.motivo ? `${turno.status} · ${turno.motivo}` : turno.status;
}

/** "Por quê" e "O que fazer" de um turno. Reaproveitado na conversa. */
export function PorqueEOQueFazer({
  porque,
  oQueFazer,
  tecnico = null,
  compacto = false,
}: {
  porque: string;
  oQueFazer: string | null;
  /** Texto cru do registro: só o super-admin recebe (ver textoTecnicoDoTurno). */
  tecnico?: string | null;
  compacto?: boolean;
}) {
  const texto = compacto ? 'text-[12px]' : 'text-sm';
  return (
    <div className="space-y-1.5">
      <div className={cn(texto, 'leading-snug')}>
        <span className="font-medium">Por quê: </span>
        <span className="text-muted-foreground">{porque}</span>
        {tecnico && (
          <span className="mt-0.5 block break-all font-mono text-[11px] text-muted-foreground/80">{tecnico}</span>
        )}
      </div>
      {oQueFazer && (
        <div
          className={cn(
            texto,
            'rounded-md border border-amber-500/30 bg-amber-500/10 leading-snug text-amber-900 dark:text-amber-200',
            compacto ? 'px-2 py-1' : 'px-2.5 py-1.5'
          )}
        >
          <span className="font-semibold">O que fazer: </span>
          {oQueFazer}
        </div>
      )}
    </div>
  );
}

/** Resposta da IA, tempo de resposta e respostas bloqueadas (parte que abre). */
export function DetalhesResposta({
  resposta,
  latencyMs,
  bloqueios,
  compacto = false,
}: {
  resposta: string | null;
  latencyMs: number | null;
  bloqueios: number;
  compacto?: boolean;
}) {
  const texto = compacto ? 'text-[12px]' : 'text-sm';
  const icone = compacto ? 'h-3 w-3' : 'h-3.5 w-3.5';
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <div className={cn('flex items-center gap-1.5 font-medium', compacto ? 'text-[11px]' : 'text-xs')}>
          <Bot className={cn(icone, 'text-primary')} aria-hidden />
          Resposta da IA
        </div>
        {resposta ? (
          <div
            className={cn(
              texto,
              'whitespace-pre-wrap break-words rounded-md border bg-muted/50 leading-snug',
              compacto ? 'px-2 py-1.5' : 'px-3 py-2'
            )}
          >
            {resposta}
          </div>
        ) : (
          <div className={cn(texto, 'italic text-muted-foreground')}>A IA não enviou resposta para esta mensagem.</div>
        )}
      </div>

      {latencyMs !== null && (
        <div className={cn(texto, 'flex items-center gap-1.5 text-muted-foreground')}>
          <Timer className={cn(icone, 'shrink-0')} aria-hidden />
          {textoTempoResposta(latencyMs)}
        </div>
      )}

      {bloqueios > 0 && (
        <div className={cn(texto, 'flex items-start gap-1.5 text-amber-700 dark:text-amber-400')}>
          <ShieldBan className={cn(icone, 'mt-0.5 shrink-0')} aria-hidden />
          <span>{textoBloqueios(bloqueios)}</span>
        </div>
      )}
    </div>
  );
}

/** Texto que o cliente mandou (ou aviso de mensagem sem texto). */
export function MensagemCliente({
  texto,
  mensagens,
  linhas,
  className,
}: {
  texto: string | null;
  mensagens: number;
  /** Corta em N linhas; sem valor mostra tudo. */
  linhas?: 1 | 2;
  className?: string;
}) {
  const extra = textoQuantidadeMensagens(mensagens);
  const corte = linhas === 1 ? 'line-clamp-1' : linhas === 2 ? 'line-clamp-2' : 'whitespace-pre-wrap';
  return (
    <div className={cn('break-words', corte, className)}>
      {texto?.trim() ? (
        <span>{texto}</span>
      ) : (
        <span className="italic text-muted-foreground">Mensagem sem texto (áudio, foto ou arquivo)</span>
      )}
      {extra && <span className="text-muted-foreground"> {extra}</span>}
    </div>
  );
}

/** Uma linha do Registro da IA. Clicar abre a resposta e o link da conversa. */
export function RegistroItem({ item, mostrarConexao }: { item: RegistroIA; mostrarConexao: boolean }) {
  const [aberto, setAberto] = useState(false);
  const { isSuperAdmin } = useAuth();
  const { explicacao, contato } = item;
  const detalhesId = `registro-${item.id}`;

  return (
    <li className={cn('rounded-lg border bg-card text-card-foreground', classeNivel(explicacao.nivel))}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-controls={detalhesId}
        className="flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4"
      >
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <ResultadoBadge explicacao={explicacao} />
            <span className="text-xs tabular-nums text-muted-foreground">{formatarDataHora(item.createdAt)}</span>
            <span className="min-w-0 truncate text-sm font-medium">{contato.nome || 'Cliente sem nome'}</span>
            {contato.telefone && (
              <span className="text-xs tabular-nums text-muted-foreground">{formatarTelefone(contato.telefone)}</span>
            )}
          </div>

          <MensagemCliente
            texto={item.texto}
            mensagens={item.mensagens}
            linhas={aberto ? undefined : 2}
            className="text-sm"
          />

          <PorqueEOQueFazer
            porque={explicacao.porque}
            oQueFazer={explicacao.oQueFazer}
            tecnico={textoTecnicoDoTurno(item, isSuperAdmin)}
          />
        </div>
        <ChevronDown
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            aberto && 'rotate-180'
          )}
          aria-hidden
        />
      </button>

      {aberto && (
        <div id={detalhesId} className="space-y-3 border-t px-3 py-3 sm:px-4">
          <DetalhesResposta resposta={item.resposta} latencyMs={item.latencyMs} bloqueios={item.bloqueios} />

          <div className="flex flex-wrap items-center justify-between gap-2">
            {mostrarConexao && item.conexao ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Wifi className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Conexão: {item.conexao}
              </span>
            ) : (
              <span />
            )}
            <Button asChild variant="outline" size="sm">
              <Link href={linkConversa(item.conversationId)}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Abrir conversa
              </Link>
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

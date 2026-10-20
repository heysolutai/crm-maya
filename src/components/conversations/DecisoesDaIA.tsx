'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Loader2, Sparkles } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { formatarDataHora } from '@/components/ai-registro/formatar';
import { classeNivel, ResultadoBadge } from '@/components/ai-registro/ResultadoBadge';
import {
  DetalhesResposta,
  MensagemCliente,
  PorqueEOQueFazer,
  textoTecnicoDoTurno,
} from '@/components/ai-registro/RegistroItem';
import type { TurnoIA, TurnosIAResposta } from '@/components/ai-registro/types';
import { useAuth } from '@/hooks/useAuth';

/** Quantas aparecem antes de "Mostrar todas". */
const VISIVEIS = 5;

function DecisaoItem({ turno }: { turno: TurnoIA }) {
  const [aberto, setAberto] = useState(false);
  const { isSuperAdmin } = useAuth();
  const detalhesId = `decisao-${turno.id}`;

  return (
    <li className={cn('rounded-md border', classeNivel(turno.explicacao.nivel))}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-controls={detalhesId}
        className="w-full space-y-1.5 rounded-md p-2 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-center gap-1.5">
          <ResultadoBadge explicacao={turno.explicacao} compacto />
          <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {formatarDataHora(turno.createdAt)}
          </span>
          <ChevronDown
            className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', aberto && 'rotate-180')}
            aria-hidden
          />
        </div>
        <MensagemCliente
          texto={turno.texto}
          mensagens={turno.mensagens}
          linhas={aberto ? undefined : 1}
          className="text-[12px]"
        />
        <PorqueEOQueFazer
          porque={turno.explicacao.porque}
          oQueFazer={turno.explicacao.oQueFazer}
          tecnico={textoTecnicoDoTurno(turno, isSuperAdmin)}
          compacto
        />
      </button>

      {aberto && (
        <div id={detalhesId} className="border-t p-2">
          <DetalhesResposta
            resposta={turno.resposta}
            latencyMs={turno.latencyMs}
            bloqueios={turno.bloqueios}
            compacto
          />
        </div>
      )}
    </li>
  );
}

/**
 * "Decisões da IA" no painel da conversa: as últimas mensagens do cliente e o
 * que a IA fez com cada uma (respondeu, ficou sem resposta, estava pausada...),
 * com o porquê e o que fazer. Atualiza sozinho a cada 30 s e quando chega
 * turno novo pelo tempo real (mesma chave ['ai-turns', conversationId]).
 */
export function DecisoesDaIA({ conversationId }: { conversationId: string }) {
  const [todas, setTodas] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ai-turns', conversationId],
    queryFn: async (): Promise<TurnoIA[]> => {
      const res = await apiFetch(`/api/conversations/ai-turns?conversationId=${encodeURIComponent(conversationId)}`);
      if (!res.ok) throw new Error('Falha ao carregar decisões da IA');
      const json = (await res.json()) as TurnosIAResposta;
      return json.data;
    },
    enabled: !!conversationId,
    // "Aguardando" vira "Sem resposta" depois de alguns minutos: o servidor recalcula.
    refetchInterval: 30_000,
  });

  const turnos = data ?? [];
  const problemas = turnos.filter((t) => t.explicacao.nivel === 'problema').length;
  const visiveis = todas ? turnos : turnos.slice(0, VISIVEIS);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <span className="text-[12px] font-medium">Decisões da IA</span>
        {turnos.length > 0 && problemas > 0 && (
          <span className="ml-auto text-[11px] text-red-600 dark:text-red-400">
            {problemas === 1 ? '1 com problema' : `${problemas} com problema`}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Carregando...
        </div>
      ) : isError && turnos.length === 0 ? (
        <p className="text-[12px] text-destructive">Não foi possível carregar as decisões da IA.</p>
      ) : turnos.length === 0 ? (
        <p className="text-[12px] italic text-muted-foreground/70">
          Nenhuma mensagem do cliente registrada ainda nesta conversa.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {visiveis.map((turno) => (
              <DecisaoItem key={turno.id} turno={turno} />
            ))}
          </ul>
          {turnos.length > VISIVEIS && (
            <button
              type="button"
              onClick={() => setTodas((v) => !v)}
              className="text-[11px] text-primary hover:underline max-lg:min-h-9"
            >
              {todas ? 'Mostrar menos' : `Mostrar todas (${turnos.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

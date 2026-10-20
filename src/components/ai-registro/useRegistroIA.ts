'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';
import type { FiltroRegistro, RegistroIAPagina } from './types';

/** Erro com o status da resposta, pra tela diferenciar "sem permissão". */
export class RegistroIAErro extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'RegistroIAErro';
    this.status = status;
  }
}

/**
 * Registro da IA paginado (30 por vez, mais recentes primeiro).
 * `ativo` false segura a busca (a tela ainda está lendo o filtro do endereço).
 */
export function useRegistroIA(filtro: FiltroRegistro, inboxId: string | null, ativo = true) {
  const { effectiveCompanyId } = useEffectiveCompanyId();

  return useInfiniteQuery({
    queryKey: ['ai-registro', effectiveCompanyId, filtro, inboxId ?? 'todas'],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<RegistroIAPagina> => {
      const params = new URLSearchParams({ filtro });
      if (pageParam) params.set('antes', pageParam);
      if (inboxId) params.set('inboxId', inboxId);
      const res = await apiFetch(`/api/ai-registro?${params.toString()}`);
      if (!res.ok) throw new RegistroIAErro('Não foi possível carregar o registro da IA.', res.status);
      return (await res.json()) as RegistroIAPagina;
    },
    getNextPageParam: (ultima) => ultima.proximo,
    enabled: !!effectiveCompanyId && ativo,
    staleTime: 30_000,
    retry: (tentativas, erro) => !(erro instanceof RegistroIAErro && erro.status === 403) && tentativas < 2,
  });
}

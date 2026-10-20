'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';
import type {
  IntegrationSavePayload,
  IntegrationsState,
  IntegrationTestResult,
} from './types';

const NATIVE_MUTATION_KEY = ['company-integrations', 'native'] as const;

/** Mensagem que a pessoa entende; nunca o erro técnico. */
async function mensagemDeErro(res: Response, padrao: string): Promise<string> {
  if (res.status === 403) return 'Só o administrador do restaurante pode alterar isso.';
  if (res.status === 400 || res.status === 404) {
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body.error === 'string' && body.error && body.error !== 'Dados invalidos') return body.error;
    } catch {
      // corpo vazio: usa o padrão
    }
  }
  return padrao;
}

function useIntegrationsKey() {
  const { effectiveCompanyId } = useEffectiveCompanyId();
  return { key: ['company-integrations', effectiveCompanyId] as const, companyId: effectiveCompanyId };
}

export function useIntegrations() {
  const { key, companyId } = useIntegrationsKey();
  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<IntegrationsState> => {
      const res = await apiFetch('/api/integrations');
      if (!res.ok) throw new Error(await mensagemDeErro(res, 'Não foi possível carregar as integrações.'));
      return (await res.json()) as IntegrationsState;
    },
    enabled: !!companyId,
  });
}

async function salvar(body: Record<string, unknown>): Promise<IntegrationsState> {
  const res = await apiFetch('/api/integrations', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await mensagemDeErro(res, 'Não foi possível salvar. Tente de novo.'));
  return (await res.json()) as IntegrationsState;
}

/** Liga/desliga ferramentas nativas com atualização otimista. */
export function useSaveNativeTools() {
  const qc = useQueryClient();
  const { key } = useIntegrationsKey();

  return useMutation({
    mutationKey: NATIVE_MUTATION_KEY,
    mutationFn: (native: string[]) => salvar({ native }),
    onMutate: async (native: string[]) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<IntegrationsState>(key);
      if (previous) {
        qc.setQueryData<IntegrationsState>(key, {
          ...previous,
          native: previous.native.map((t) => ({ ...t, enabled: native.includes(t.name) })),
        });
      }
      return { previous };
    },
    onError: (_error, _native, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSettled: () => {
      // Vários cliques seguidos: só recarrega depois do último.
      if (qc.isMutating({ mutationKey: NATIVE_MUTATION_KEY }) === 1) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useSaveIntegration() {
  const qc = useQueryClient();
  const { key } = useIntegrationsKey();

  return useMutation({
    mutationFn: (payload: IntegrationSavePayload) => salvar({ integration: payload }),
    onSuccess: (data) => {
      qc.setQueryData(key, data);
    },
  });
}

/**
 * Testa a integração. Com `inboxId`, o teste usa o ID de restaurante DESSE
 * número de WhatsApp (cada número pode ter o seu).
 */
export function useTestIntegration() {
  const qc = useQueryClient();
  const { key } = useIntegrationsKey();

  return useMutation({
    mutationFn: async (params: { integrationId: string; inboxId?: string }): Promise<IntegrationTestResult> => {
      const res = await apiFetch('/api/integrations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId: params.integrationId,
          ...(params.inboxId ? { inboxId: params.inboxId } : {}),
        }),
      });
      if (!res.ok) throw new Error(await mensagemDeErro(res, 'Não foi possível testar agora. Tente de novo.'));
      return (await res.json()) as IntegrationTestResult;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });
}

/**
 * Salva o "ID do restaurante" de UM WhatsApp (fica na configuração da conexão,
 * Inbox.channelConfig.restaurantId). Depois recarrega a lista de integrações
 * para o aviso de "falta preencher" e o resultado do teste se atualizarem.
 */
export function useSaveRestaurantId() {
  const qc = useQueryClient();
  const { companyId } = useIntegrationsKey();

  return useMutation({
    mutationFn: async (params: { inboxId: string; restaurantId: string }): Promise<void> => {
      const res = await apiFetch(`/api/agents${companyId ? `?companyId=${companyId}` : ''}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: params.inboxId, restaurantId: params.restaurantId.trim() }),
      });
      if (!res.ok) throw new Error(await mensagemDeErro(res, 'Não foi possível salvar o ID. Tente de novo.'));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company-integrations'] });
      qc.invalidateQueries({ queryKey: ['inboxes'] });
    },
  });
}

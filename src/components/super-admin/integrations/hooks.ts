import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { FalhaFerramentaExplicada } from '@/lib/erros/ferramentas';
import {
  readApiError,
  type AdminIntegration,
  type AdminTool,
  type CompanyOption,
  type IntegrationsResponse,
  type ToolTestResult,
} from './types';

/** React Query do catalogo de integracoes (super-admin). */

export const INTEGRATIONS_KEY = ['admin-integrations'] as const;

export function useAdminIntegrations() {
  return useQuery<IntegrationsResponse>({
    queryKey: INTEGRATIONS_KEY,
    queryFn: async () => {
      const res = await apiFetch('/api/admin/integrations');
      if (!res.ok) throw new Error(await readApiError(res, 'Falha ao carregar integrações'));
      return res.json();
    },
  });
}

async function sendJson<T>(url: string, method: string, body: unknown, fallback: string): Promise<T> {
  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readApiError(res, fallback));
  return res.json() as Promise<T>;
}

export function useSaveIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id?: string; payload: Record<string, unknown> }) =>
      id
        ? sendJson<AdminIntegration>(`/api/admin/integrations/${id}`, 'PUT', payload, 'Falha ao salvar a integração')
        : sendJson<AdminIntegration>('/api/admin/integrations', 'POST', payload, 'Falha ao criar a integração'),
    onSuccess: (saved) => {
      // Ja coloca no cache: a tela de edicao abre sem esperar o refetch.
      queryClient.setQueryData<IntegrationsResponse>(INTEGRATIONS_KEY, (old) => {
        if (!old) return old;
        const exists = old.integrations.some((i) => i.id === saved.id);
        return {
          ...old,
          integrations: exists
            ? old.integrations.map((i) => (i.id === saved.id ? saved : i))
            : [...old.integrations, saved],
        };
      });
      queryClient.invalidateQueries({ queryKey: INTEGRATIONS_KEY });
    },
  });
}

export function useDeleteIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/admin/integrations/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readApiError(res, 'Falha ao excluir a integração'));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: INTEGRATIONS_KEY }),
  });
}

export function useSaveTool(integrationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ toolId, payload }: { toolId?: string; payload: Record<string, unknown> }) =>
      toolId
        ? sendJson<AdminTool>(
            `/api/admin/integrations/${integrationId}/tools/${toolId}`,
            'PUT',
            payload,
            'Falha ao salvar a ferramenta'
          )
        : sendJson<AdminTool>(
            `/api/admin/integrations/${integrationId}/tools`,
            'POST',
            payload,
            'Falha ao criar a ferramenta'
          ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: INTEGRATIONS_KEY }),
  });
}

export interface McpSyncResult {
  integration: AdminIntegration;
  resumo: { total: number; novas: number; atualizadas: number; desativadas: number };
}

/** Busca as ferramentas no servidor MCP da integração e atualiza o catálogo. */
export function useSyncMcp(integrationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      sendJson<McpSyncResult>(
        `/api/admin/integrations/${integrationId}/mcp-sync`,
        'POST',
        {},
        'Não foi possível buscar as ferramentas do servidor'
      ),
    onSuccess: (r) => {
      queryClient.setQueryData<IntegrationsResponse>(INTEGRATIONS_KEY, (old) =>
        old ? { ...old, integrations: old.integrations.map((i) => (i.id === r.integration.id ? r.integration : i)) } : old
      );
      queryClient.invalidateQueries({ queryKey: INTEGRATIONS_KEY });
    },
  });
}

/** Ferramenta de servidor MCP: só nome pro restaurante, "muda dados" e ativa. */
export function useUpdateMcpTool(integrationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ toolId, patch }: { toolId: string; patch: { label?: string; isWrite?: boolean; isActive?: boolean } }) =>
      sendJson<AdminTool>(`/api/admin/integrations/${integrationId}/tools/${toolId}`, 'PUT', patch, 'Falha ao salvar a ferramenta'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: INTEGRATIONS_KEY }),
  });
}

export function useDeleteTool(integrationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (toolId: string) => {
      const res = await apiFetch(`/api/admin/integrations/${integrationId}/tools/${toolId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readApiError(res, 'Falha ao excluir a ferramenta'));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: INTEGRATIONS_KEY }),
  });
}

export function useTestTool(integrationId: string) {
  return useMutation({
    mutationFn: ({ toolId, companyId, args }: { toolId: string; companyId: string; args: Record<string, unknown> }) =>
      sendJson<ToolTestResult>(
        `/api/admin/integrations/${integrationId}/tools/${toolId}/test`,
        'POST',
        { companyId, arguments: args },
        'Falha ao executar o teste'
      ),
  });
}

export interface IntegrationFailure {
  id: string;
  empresa: string;
  ferramenta: string;
  toolName: string;
  createdAt: string;
  explicacao: FalhaFerramentaExplicada;
  httpStatus: number | null;
  erro: string | null;
}

export interface IntegrationFailures {
  deramCerto: number;
  normais: number;
  totalFalhas: number;
  falhas: IntegrationFailure[];
}

/** Uso da integracao pela IA nas ultimas 24h (todas as empresas). */
export function useIntegrationFailures(integrationId: string | null) {
  return useQuery<IntegrationFailures>({
    queryKey: [...INTEGRATIONS_KEY, 'falhas', integrationId],
    queryFn: async () => {
      const res = await apiFetch(`/api/admin/integrations/${integrationId}/falhas`);
      if (!res.ok) throw new Error(await readApiError(res, 'Falha ao carregar as falhas'));
      return res.json();
    },
    enabled: !!integrationId,
    refetchInterval: 60_000,
  });
}

/** Restaurantes para o teste (lista do super-admin, so id e nome). */
export function useCompanyOptions() {
  return useQuery<CompanyOption[]>({
    queryKey: [...INTEGRATIONS_KEY, 'companies'],
    queryFn: async () => {
      const res = await apiFetch('/api/companies');
      if (!res.ok) throw new Error(await readApiError(res, 'Falha ao carregar restaurantes'));
      const data: unknown = await res.json();
      if (!Array.isArray(data)) return [];
      return data
        .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
        .map((c) => ({
          id: String(c.id ?? ''),
          name: String(c.tradeName || c.name || 'Sem nome'),
        }))
        .filter((c) => c.id)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    },
    staleTime: 5 * 60 * 1000,
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';

/** Estado de GET/PUT/POST/DELETE /api/ai-tools/mcp. */
export interface ToolModeState {
  modo: 'function_calls' | 'mcp';
  conexao: { endereco: string; temChave: boolean } | null;
  ferramentas: { name: string; label: string; description: string; isWrite: boolean; ligada: boolean }[];
  transferirLigada: boolean;
  problemaRecente: { titulo: string; motivo: string; oQueFazer: string | null; quando: string; vezes: number } | null;
}

export type EstiloChave = 'bearer' | 'x-api-key' | 'apikey';

const chave = (agentId: string) => ['ai-tool-mode', agentId] as const;

async function mensagemDeErro(res: Response, padrao: string): Promise<string> {
  try {
    const data: unknown = await res.json();
    const erro = data && typeof data === 'object' ? (data as { error?: unknown }).error : null;
    return typeof erro === 'string' && erro.trim() ? erro : padrao;
  } catch {
    return padrao;
  }
}

async function enviar(method: string, url: string, body: unknown, padrao: string): Promise<ToolModeState> {
  const res = await apiFetch(url, {
    method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(await mensagemDeErro(res, padrao));
  return (await res.json()) as ToolModeState;
}

export function useToolMode(agentId: string) {
  const qc = useQueryClient();
  const key = chave(agentId);
  const gravar = (s: ToolModeState) => {
    qc.setQueryData(key, s);
    // O que a IA recebe mudou: o teste e o painel de situacao recarregam.
    qc.invalidateQueries({ queryKey: ['maestro-playground'] });
    qc.invalidateQueries({ queryKey: ['ai-health'] });
  };

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<ToolModeState> => {
      const res = await apiFetch(`/api/ai-tools/mcp?agentId=${encodeURIComponent(agentId)}`);
      if (!res.ok) throw new Error(await mensagemDeErro(res, 'Não foi possível carregar.'));
      return res.json();
    },
    enabled: !!agentId,
  });

  const trocarModo = useMutation({
    mutationFn: (modo: ToolModeState['modo']) =>
      enviar('PUT', '/api/ai-tools/mcp', { agentId, modo }, 'Não foi possível trocar o modo.'),
    onSuccess: gravar,
  });

  const ligarFerramentas = useMutation({
    mutationFn: (ferramentasLigadas: string[]) =>
      enviar('PUT', '/api/ai-tools/mcp', { agentId, ferramentasLigadas }, 'Não foi possível salvar.'),
    onSuccess: gravar,
  });

  const conectar = useMutation({
    mutationFn: (dados: { endereco: string; chave?: string; estilo: EstiloChave }) =>
      enviar('POST', '/api/ai-tools/mcp', { agentId, ...dados }, 'Não foi possível conectar.'),
    onSuccess: gravar,
  });

  const desconectar = useMutation({
    mutationFn: () =>
      enviar('DELETE', `/api/ai-tools/mcp?agentId=${encodeURIComponent(agentId)}`, undefined, 'Não foi possível desconectar.'),
    onSuccess: gravar,
  });

  return { query, trocarModo, ligarFerramentas, conectar, desconectar };
}

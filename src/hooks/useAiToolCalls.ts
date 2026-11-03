import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { ChamadaFerramenta } from '@/components/conversations/ferramentas';

/**
 * Ferramentas que a IA usou numa conversa (reserva, consulta, transferência...),
 * pra aparecerem no meio do chat. O tempo real invalida esta chave quando a IA
 * usa uma ferramenta (execution:log -> ['ai-tool-calls', id]).
 */
export function useAiToolCalls(conversationId: string | null) {
  return useQuery({
    queryKey: ['ai-tool-calls', conversationId],
    queryFn: async (): Promise<ChamadaFerramenta[]> => {
      const res = await apiFetch(
        `/api/conversations/ai-tool-calls?conversationId=${encodeURIComponent(conversationId ?? '')}`
      );
      if (!res.ok) throw new Error('Falha ao carregar ferramentas da IA');
      const json = (await res.json()) as { data: ChamadaFerramenta[] };
      return json.data;
    },
    enabled: !!conversationId,
  });
}

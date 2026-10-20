import { apiFetch } from '@/lib/api/client';
import { useQuery } from '@tanstack/react-query';
import {
  buildSetupChecklist,
  EMPTY_SETUP_STATUS,
  type ChecklistItem,
  type ChecklistModes,
  type SetupStatus,
} from '@/components/setup/setup-status';

export type { ChecklistItem, ChecklistStatus, ChecklistGroup, SetupStatus } from '@/components/setup/setup-status';

/**
 * Checklist de configuracao do restaurante, calculado a partir dos dados reais
 * (GET /api/setup-checklist).
 *
 * `modes` diz quais blocos cobrar. Sem `modes`: IA Atendimento sempre entra e
 * IA Avaliacao entra quando o modulo de avaliacao esta ligado.
 *
 * Enquanto carrega, o checklist e montado sobre um estado vazio (tudo pendente)
 * e nao sobre lista vazia: com 0 de 0 a tela concluiria que esta tudo pronto.
 */
export function useSetupChecklist(companyId: string | undefined, modes?: Partial<ChecklistModes>) {
  const query = useQuery<SetupStatus | null>({
    queryKey: ['setup-checklist', companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const res = await apiFetch(`/api/setup-checklist?companyId=${encodeURIComponent(companyId)}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Falha ao carregar o checklist de setup');
      }
      return (await res.json()) as SetupStatus;
    },
    enabled: !!companyId,
  });

  const status = query.data ?? null;
  const resolvedModes: ChecklistModes = {
    atendimento: modes?.atendimento ?? true,
    avaliacao: modes?.avaliacao ?? !!status?.review?.enabled,
  };

  const items: ChecklistItem[] = buildSetupChecklist(status ?? EMPTY_SETUP_STATUS, resolvedModes);

  const completedCount = items.filter((i) => i.status === 'green').length;
  const totalCount = items.length;
  const requiredItems = items.filter((i) => i.category === 'red');
  const requiredCount = requiredItems.length;
  const requiredCompletedCount = requiredItems.filter((i) => i.status === 'green').length;

  return {
    items,
    completedCount,
    totalCount,
    requiredCount,
    requiredCompletedCount,
    /** Todos os obrigatorios ok (recomendados podem faltar). */
    allRequiredDone: !!status && requiredCompletedCount === requiredCount,
    status,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}

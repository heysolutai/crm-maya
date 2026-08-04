import { apiFetch } from '@/lib/api/client';
import { useQuery } from '@tanstack/react-query';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';

export function useSidebarCounts() {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();

  const { data } = useQuery({
    queryKey: ['sidebar-counts', companyId],
    queryFn: async () => {
      if (!companyId) return { appointmentsToday: 0, pendingFollowUps: 0 };

      const res = await apiFetch(`/api/sidebar-counts?companyId=${companyId}`);
      if (!res.ok) return { appointmentsToday: 0, pendingFollowUps: 0 };
      return await res.json();
    },
    enabled: !!companyId,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  return {
    appointmentsToday: data?.appointmentsToday || 0,
    pendingFollowUps: data?.pendingFollowUps || 0,
  };
}

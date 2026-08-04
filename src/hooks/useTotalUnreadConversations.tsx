import { apiFetch } from '@/lib/api/client';
import { useQuery } from '@tanstack/react-query';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';

export function useTotalUnreadConversations() {
  const { effectiveCompanyId } = useEffectiveCompanyId();

  return useQuery({
    queryKey: ['total-unread-conversations', effectiveCompanyId],
    queryFn: async () => {
      if (!effectiveCompanyId) return 0;

      const res = await apiFetch(`/api/total-unread?companyId=${effectiveCompanyId}`);
      if (!res.ok) {
        console.error('[UnreadCount] Error fetching unread count');
        return 0;
      }

      const data = await res.json();
      return data.count || 0;
    },
    enabled: !!effectiveCompanyId,
    refetchInterval: 3000, // Poll every 3 seconds for near-realtime badge
    staleTime: 10000,
  });
}

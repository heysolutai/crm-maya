import { useQuery } from '@tanstack/react-query';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';

export function useTotalUnreadConversations() {
  const { effectiveCompanyId } = useEffectiveCompanyId();

  return useQuery({
    queryKey: ['total-unread-conversations', effectiveCompanyId],
    queryFn: async () => {
      if (!effectiveCompanyId) return 0;

      const res = await fetch(`/api/total-unread?companyId=${effectiveCompanyId}`);
      if (!res.ok) {
        console.error('[UnreadCount] Error fetching unread count');
        return 0;
      }

      const data = await res.json();
      return data.count || 0;
    },
    enabled: !!effectiveCompanyId,
    refetchInterval: 15000, // Poll every 15 seconds (replaces realtime)
    staleTime: 10000,
  });
}

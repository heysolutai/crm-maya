import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';
import { useQueryClient } from '@tanstack/react-query';

export function useTotalUnreadConversations() {
  const { effectiveCompanyId } = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  // Subscribe to realtime updates for instant badge updates
  useEffect(() => {
    if (!effectiveCompanyId) return;

    const channel = supabase
      .channel('unread-messages-badge')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `company_id=eq.${effectiveCompanyId}`,
        },
        (payload) => {
          if (payload.new && payload.new.sender_type === 'client') {
            queryClient.invalidateQueries({ queryKey: ['total-unread-conversations', effectiveCompanyId] });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `company_id=eq.${effectiveCompanyId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['total-unread-conversations', effectiveCompanyId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [effectiveCompanyId, queryClient]);

  return useQuery({
    queryKey: ['total-unread-conversations', effectiveCompanyId],
    queryFn: async () => {
      if (!effectiveCompanyId) return 0;

      // Count unread messages from clients in the last 48 hours
      const cutoffDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

      const { count, error } = await supabase
        .from('messages')
        .select('id, conversations!inner(company_id)', { count: 'exact', head: true })
        .eq('sender_type', 'client')
        .eq('is_read', false)
        .eq('conversations.company_id', effectiveCompanyId)
        .gte('created_at', cutoffDate);

      if (error) {
        console.error('[UnreadCount] Error fetching unread count:', error);
        return 0;
      }

      return count || 0;
    },
    enabled: !!effectiveCompanyId,
    refetchInterval: 60000, // Fallback: refetch every 60 seconds (realtime already handles instant updates)
    staleTime: 30000, // 30s - dados ficam "frescos" por mais tempo
  });
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';

export function useSidebarCounts() {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();

  const { data } = useQuery({
    queryKey: ['sidebar-counts', companyId],
    queryFn: async () => {
      if (!companyId) return { appointmentsToday: 0, pendingFollowUps: 0 };

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const [appointmentsRes, followUpsRes] = await Promise.all([
        supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .gte('scheduled_for', todayStart.toISOString())
          .lte('scheduled_for', todayEnd.toISOString())
          .in('status', ['scheduled', 'confirmed']),
        supabase
          .from('follow_up_jobs')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('status', 'pending'),
      ]);

      return {
        appointmentsToday: appointmentsRes.count || 0,
        pendingFollowUps: followUpsRes.count || 0,
      };
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

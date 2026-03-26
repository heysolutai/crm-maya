import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';

export function useSuperAdminMetrics() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

  const { data: metrics, isLoading } = useQuery({
    queryKey: ['super-admin-metrics'],
    queryFn: async () => {
      // Fetch active companies count
      const { count: activeCompanies } = await supabase
        .from('companies')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      // Fetch total clients count
      const { count: totalClients } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true });

      // Fetch AI messages in last 30 days
      const { count: aiMessages } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('sender_type', 'ai')
        .gte('created_at', thirtyDaysAgoISO);

      // Fetch revenue from approved sales in last 30 days
      const { data: salesData } = await supabase
        .from('sales')
        .select('total_amount')
        .eq('status', 'approved')
        .gte('created_at', thirtyDaysAgoISO);

      const totalRevenue = salesData?.reduce((sum, sale) => sum + (sale.total_amount || 0), 0) || 0;

      return {
        activeCompanies: activeCompanies || 0,
        totalClients: totalClients || 0,
        aiMessages: aiMessages || 0,
        totalRevenue,
      };
    },
  });

  return {
    metrics: metrics || {
      activeCompanies: 0,
      totalClients: 0,
      aiMessages: 0,
      totalRevenue: 0,
    },
    isLoading,
  };
}

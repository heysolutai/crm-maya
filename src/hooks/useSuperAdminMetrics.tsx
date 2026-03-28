import { useQuery } from '@tanstack/react-query';

export function useSuperAdminMetrics() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['super-admin-metrics'],
    queryFn: async () => {
      const res = await fetch('/api/admin/metrics');
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch metrics');
      return await res.json();
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

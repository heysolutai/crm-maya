import { apiFetch } from '@/lib/api/client';
import { useQuery } from "@tanstack/react-query";
import { useEffectiveCompanyId } from "./useEffectiveCompanyId";

export function useDepartmentQueue() {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();

  const { data, isLoading } = useQuery({
    queryKey: ["department-queue", companyId],
    queryFn: async () => {
      const res = await apiFetch(`/api/departments/queue?companyId=${companyId}`);
      if (!res.ok) return { queues: {}, totalWaiting: 0 };
      return res.json() as Promise<{ queues: Record<string, number>; totalWaiting: number }>;
    },
    enabled: !!companyId,
    refetchInterval: 10000, // Poll every 10s
  });

  const getQueueCount = (departmentId: string): number => {
    return data?.queues[departmentId] || 0;
  };

  return {
    queues: data?.queues || {},
    totalWaiting: data?.totalWaiting || 0,
    getQueueCount,
    isLoading,
  };
}

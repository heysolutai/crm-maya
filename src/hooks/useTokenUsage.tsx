import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';

export interface TokenUsageSummary {
  totalCost: number;
  totalTokens: number;
  totalRequests: number;
  byModel: Array<{
    model: string;
    requests: number;
    totalTokens: number;
    totalCost: number;
    avgTokensPerRequest: number;
  }>;
  byCompany: Array<{
    companyId: string;
    companyName: string;
    totalCost: number;
    totalTokens: number;
    requests: number;
  }>;
  dailyUsage: Array<{
    date: string;
    cost: number;
    tokens: number;
    requests: number;
  }>;
}

export function useTokenUsage(days: number = 30) {
  const { user, role } = useAuth();

  return useQuery({
    queryKey: ['token-usage', days],
    queryFn: async (): Promise<TokenUsageSummary> => {
      if (!user) throw new Error('User not authenticated');
      if (role !== 'super_admin') {
        throw new Error('Unauthorized: Super admin access required');
      }

      const res = await fetch(`/api/admin/token-usage?days=${days}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch token usage');
      return await res.json();
    },
    enabled: !!user && role === 'super_admin',
  });
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
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

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Buscar dados de uso de TODAS as empresas (super admin)
      const { data: usageData, error } = await supabase
        .from('ai_token_usage')
        .select('*, companies(name)')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Calcular totais
      const totalCost = usageData.reduce((sum, row) => sum + Number(row.total_cost), 0);
      const totalTokens = usageData.reduce((sum, row) => sum + row.total_tokens, 0);
      const totalRequests = usageData.length;

      // Agrupar por modelo
      const modelMap = new Map<string, {
        requests: number;
        tokens: number;
        cost: number;
      }>();

      usageData.forEach((row) => {
        const current = modelMap.get(row.model) || { requests: 0, tokens: 0, cost: 0 };
        modelMap.set(row.model, {
          requests: current.requests + 1,
          tokens: current.tokens + row.total_tokens,
          cost: current.cost + Number(row.total_cost),
        });
      });

      const byModel = Array.from(modelMap.entries()).map(([model, data]) => ({
        model,
        requests: data.requests,
        totalTokens: data.tokens,
        totalCost: data.cost,
        avgTokensPerRequest: Math.round(data.tokens / data.requests),
      })).sort((a, b) => b.totalCost - a.totalCost);

      // Agrupar por empresa
      const companyMap = new Map<string, {
        name: string;
        requests: number;
        tokens: number;
        cost: number;
      }>();

      usageData.forEach((row) => {
        const companyName = (row.companies as any)?.name || 'Unknown';
        const current = companyMap.get(row.company_id) || { 
          name: companyName, 
          requests: 0, 
          tokens: 0, 
          cost: 0 
        };
        companyMap.set(row.company_id, {
          name: companyName,
          requests: current.requests + 1,
          tokens: current.tokens + row.total_tokens,
          cost: current.cost + Number(row.total_cost),
        });
      });

      const byCompany = Array.from(companyMap.entries()).map(([companyId, data]) => ({
        companyId,
        companyName: data.name,
        requests: data.requests,
        totalTokens: data.tokens,
        totalCost: data.cost,
      })).sort((a, b) => b.totalCost - a.totalCost);

      // Agrupar por dia
      const dailyMap = new Map<string, { cost: number; tokens: number; requests: number }>();

      usageData.forEach((row) => {
        const date = new Date(row.created_at).toISOString().split('T')[0];
        const current = dailyMap.get(date) || { cost: 0, tokens: 0, requests: 0 };
        dailyMap.set(date, {
          cost: current.cost + Number(row.total_cost),
          tokens: current.tokens + row.total_tokens,
          requests: current.requests + 1,
        });
      });

      const dailyUsage = Array.from(dailyMap.entries())
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return {
        totalCost,
        totalTokens,
        totalRequests,
        byModel,
        byCompany,
        dailyUsage,
      };
    },
    enabled: !!user && role === 'super_admin',
  });
}

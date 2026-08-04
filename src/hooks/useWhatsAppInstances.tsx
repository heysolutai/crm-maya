import { apiFetch } from '@/lib/api/client';
import { useQuery } from '@tanstack/react-query';

/**
 * @deprecated Use `useInboxes` em vez disso. Mantido temporariamente apenas
 * para retro-compatibilidade dos componentes legados.
 *
 * Agora chama `/api/agents` (rota /api/whatsapp-instances foi removida).
 */
export function useWhatsAppInstances(companyId: string | undefined) {
  return useQuery({
    queryKey: ['whatsapp-instances', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const res = await apiFetch(`/api/agents?companyId=${companyId}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch instances');
      const data = await res.json();

      // Map camelCase to snake_case for backwards compatibility
      return (data || []).map((item: any) => ({
        ...item,
        instance_name: item.instanceName ?? item.instance_name ?? item.displayName ?? item.display_name,
        instance_api_key: item.instanceApiKey ?? item.instance_api_key,
        qr_code: item.qrCode ?? item.qr_code,
        status: item.status,
        is_active: item.isActive ?? item.is_active,
      }));
    },
    enabled: !!companyId,
  });
}

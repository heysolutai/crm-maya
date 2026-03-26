import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';

export function useWhatsAppInstances(companyId: string | undefined) {
  return useQuery({
    queryKey: ['whatsapp-instances', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('id, instance_name, instance_api_key, status, is_active')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('instance_name');
      
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });
}

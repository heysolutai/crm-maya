import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ClientForCompany {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  ai_paused: boolean;
  created_at: string;
  avatar_url: string | null;
  stage_id: string | null;
}

export function useClientsForCompany(companyId: string | undefined) {
  const [clients, setClients] = useState<ClientForCompany[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchClients = async () => {
    if (!companyId) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, first_name, last_name, phone, email, ai_paused, created_at, avatar_url, stage_id')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast({
        title: 'Erro ao carregar clientes',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAIPaused = async (clientId: string, currentValue: boolean) => {
    try {
      const { error } = await supabase
        .from('clients')
        .update({ ai_paused: !currentValue })
        .eq('id', clientId);

      if (error) throw error;

      setClients(prev => 
        prev.map(client => 
          client.id === clientId 
            ? { ...client, ai_paused: !currentValue }
            : client
        )
      );

      toast({
        title: !currentValue ? 'IA pausada' : 'IA ativada',
        description: !currentValue 
          ? 'A IA não responderá automaticamente para este cliente'
          : 'A IA voltou a responder automaticamente para este cliente',
      });
    } catch (error) {
      console.error('Error toggling AI pause:', error);
      toast({
        title: 'Erro ao atualizar status',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    fetchClients();
  }, [companyId]);

  return {
    clients,
    isLoading,
    fetchClients,
    toggleAIPaused,
  };
}

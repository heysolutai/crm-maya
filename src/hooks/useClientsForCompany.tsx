import { apiFetch } from '@/lib/api/client';
import { useState, useEffect } from 'react';
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

function mapClient(raw: any): ClientForCompany {
  return {
    id: raw.id,
    first_name: raw.firstName ?? raw.first_name,
    last_name: raw.lastName ?? raw.last_name,
    phone: raw.phone,
    email: raw.email,
    ai_paused: raw.aiPaused ?? raw.ai_paused ?? false,
    created_at: raw.createdAt ?? raw.created_at,
    avatar_url: raw.avatarUrl ?? raw.avatar_url,
    stage_id: raw.stageId ?? raw.stage_id,
  };
}

export function useClientsForCompany(companyId: string | undefined) {
  const [clients, setClients] = useState<ClientForCompany[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchClients = async () => {
    if (!companyId) return;

    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/clients?companyId=${companyId}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch clients');
      const data = await res.json();

      setClients((data || []).map(mapClient));
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
      const res = await apiFetch('/api/clients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: clientId, aiPaused: !currentValue }),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update client');

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

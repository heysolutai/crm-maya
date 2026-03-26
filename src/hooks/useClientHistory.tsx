import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface ClientHistoryItem {
  id: string;
  client_id: string;
  stage_id: string;
  entered_at: string;
  left_at?: string;
  duration_minutes?: number;
  notes?: string;
  moved_by?: string;
  stage: {
    name: string;
    color: string;
  };
  mover?: {
    full_name?: string;
    email: string;
  };
}

export function useClientHistory(clientId: string | null) {
  const [history, setHistory] = useState<ClientHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchHistory = async () => {
    if (!clientId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('client_funnel_history')
        .select(`
          *,
          stage:funnel_stages!stage_id(name, color),
          mover:users!moved_by(full_name, email)
        `)
        .eq('client_id', clientId)
        .order('entered_at', { ascending: false });

      if (error) throw error;
      setHistory(data || []);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar histórico',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [clientId]);

  return {
    history,
    loading,
    fetchHistory,
  };
}

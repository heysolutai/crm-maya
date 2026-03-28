import { useState, useEffect } from 'react';
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

function mapHistoryItem(raw: any): ClientHistoryItem {
  return {
    id: raw.id,
    client_id: raw.clientId ?? raw.client_id,
    stage_id: raw.stageId ?? raw.stage_id,
    entered_at: raw.enteredAt ?? raw.entered_at,
    left_at: raw.leftAt ?? raw.left_at,
    duration_minutes: raw.durationMinutes ?? raw.duration_minutes,
    notes: raw.notes,
    moved_by: raw.movedBy ?? raw.moved_by,
    stage: raw.stage ? {
      name: raw.stage.name,
      color: raw.stage.color,
    } : { name: '', color: '' },
    mover: raw.mover ? {
      full_name: raw.mover.fullName ?? raw.mover.full_name,
      email: raw.mover.email,
    } : undefined,
  };
}

export function useClientHistory(clientId: string | null) {
  const [history, setHistory] = useState<ClientHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchHistory = async () => {
    if (!clientId) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/client-history?clientId=${clientId}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch history');
      const data = await res.json();
      setHistory((data || []).map(mapHistoryItem));
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

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { toast } from 'sonner';

export interface Reservation {
  id: string;
  companyId: string;
  source: string; // 'ai' | 'agent' | 'manual'
  customerName: string | null;
  partySize: number | null;
  reservedFor: string | null;
  status: string; // 'confirmed' | 'cancelled' | 'no_show'
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReservationData {
  source?: 'ai' | 'agent' | 'manual';
  customerName?: string | null;
  partySize?: number | null;
  reservedFor?: string | null;
  status?: 'confirmed' | 'cancelled' | 'no_show';
  notes?: string | null;
}

export function useReservations() {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<Reservation[]>({
    queryKey: ['reservations', companyId],
    queryFn: async () => {
      const res = await fetch(`/api/reservations?companyId=${companyId}&limit=200`);
      if (!res.ok) throw new Error('Falha ao buscar reservas');
      return res.json();
    },
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: CreateReservationData) => {
      const res = await fetch(`/api/reservations?companyId=${companyId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'manual', ...payload }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Falha ao criar reserva');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations'] });
      toast.success('Reserva criada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<Reservation>) => {
      const res = await fetch(`/api/reservations?companyId=${companyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Falha ao atualizar reserva');
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservations'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    reservations: data || [],
    isLoading,
    createReservation: createMutation.mutate,
    isCreating: createMutation.isPending,
    updateReservation: updateMutation.mutate,
  };
}

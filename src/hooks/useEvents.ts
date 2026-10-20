'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';

export interface EventItem {
  id: string;
  name: string;
  description: string | null;
  priceInfo: string | null;
  /** ISO; a data do evento (sem hora). */
  eventDate: string | null;
  imageUrls: string[];
  extraFields: string[];
  capacity: number | null;
  isActive: boolean;
  registrationsCount: number;
  guestsCount: number;
}

export interface EventInput {
  name: string;
  description: string | null;
  priceInfo: string | null;
  /** yyyy-MM-dd ou null */
  eventDate: string | null;
  capacity: number | null;
  isActive?: boolean;
  imageUrls: string[];
  extraFields: string[];
}

export interface RegistrationItem {
  id: string;
  eventId: string;
  eventName: string;
  name: string;
  phone: string | null;
  guests: number | null;
  notes: string | null;
  status: 'confirmed' | 'cancelled' | string;
  source: 'ai' | 'manual' | string;
  createdAt: string;
}

export interface RegistrationInput {
  eventId: string;
  name: string;
  phone: string | null;
  guests: number | null;
  notes: string | null;
}

async function erro(res: Response, padrao: string): Promise<Error> {
  if (res.status === 403) return new Error('Só o administrador do restaurante pode fazer isso.');
  try {
    const body = (await res.json()) as { error?: unknown };
    if (res.status === 400 && typeof body.error === 'string' && body.error && body.error !== 'Dados invalidos') {
      return new Error(body.error);
    }
  } catch {
    // corpo vazio
  }
  return new Error(padrao);
}

function useCompanyKey() {
  const { effectiveCompanyId } = useEffectiveCompanyId();
  return effectiveCompanyId;
}

export function useEvents() {
  const companyId = useCompanyKey();
  return useQuery({
    queryKey: ['events', companyId],
    queryFn: async (): Promise<EventItem[]> => {
      const res = await apiFetch('/api/events');
      if (!res.ok) throw await erro(res, 'Não foi possível carregar os eventos.');
      return ((await res.json()) as { data: EventItem[] }).data;
    },
    enabled: !!companyId,
  });
}

export function useRegistrations(filters: { eventId?: string; search?: string }) {
  const companyId = useCompanyKey();
  return useQuery({
    queryKey: ['event-registrations', companyId, filters.eventId ?? '', filters.search ?? ''],
    queryFn: async (): Promise<RegistrationItem[]> => {
      const params = new URLSearchParams();
      if (filters.eventId) params.set('eventId', filters.eventId);
      if (filters.search) params.set('search', filters.search);
      const res = await apiFetch(`/api/events/registrations?${params.toString()}`);
      if (!res.ok) throw await erro(res, 'Não foi possível carregar os inscritos.');
      return ((await res.json()) as { data: RegistrationItem[] }).data;
    },
    enabled: !!companyId,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['events'] });
    qc.invalidateQueries({ queryKey: ['event-registrations'] });
    // A aba "Ferramentas" avisa quando não há evento cadastrado.
    qc.invalidateQueries({ queryKey: ['company-integrations'] });
  };
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function useSaveEvent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (params: { id?: string; data: Partial<EventInput> }): Promise<void> => {
      const res = await apiFetch(params.id ? `/api/events/${params.id}` : '/api/events', {
        method: params.id ? 'PUT' : 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(params.data),
      });
      if (!res.ok) throw await erro(res, 'Não foi possível salvar o evento. Tente de novo.');
    },
    onSuccess: invalidate,
  });
}

/** Liga/desliga o evento com atualização imediata na tela. */
export function useToggleEvent() {
  const qc = useQueryClient();
  const companyId = useCompanyKey();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (params: { id: string; isActive: boolean }): Promise<void> => {
      const res = await apiFetch(`/api/events/${params.id}`, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ isActive: params.isActive }),
      });
      if (!res.ok) throw await erro(res, 'Não foi possível salvar. Tente de novo.');
    },
    onMutate: async (params) => {
      const key = ['events', companyId];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<EventItem[]>(key);
      if (previous) {
        qc.setQueryData<EventItem[]>(
          key,
          previous.map((e) => (e.id === params.id ? { ...e, isActive: params.isActive } : e))
        );
      }
      return { previous, key };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.previous) qc.setQueryData(ctx.key, ctx.previous);
    },
    onSettled: invalidate,
  });
}

export function useDeleteEvent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await apiFetch(`/api/events/${id}`, { method: 'DELETE' });
      if (!res.ok) throw await erro(res, 'Não foi possível excluir o evento.');
    },
    onSuccess: invalidate,
  });
}

export function useUploadEventPhoto() {
  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      const form = new FormData();
      form.append('file', file);
      const res = await apiFetch('/api/events/upload', { method: 'POST', body: form });
      if (!res.ok) {
        let msg = 'Não foi possível enviar a foto.';
        try {
          const body = (await res.json()) as { error?: unknown };
          if (res.status === 400 && typeof body.error === 'string') msg = body.error;
        } catch {
          // corpo vazio
        }
        throw new Error(msg);
      }
      return ((await res.json()) as { url: string }).url;
    },
  });
}

export function useAddRegistration() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (data: RegistrationInput): Promise<void> => {
      const res = await apiFetch('/api/events/registrations', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(data),
      });
      if (!res.ok) throw await erro(res, 'Não foi possível adicionar. Tente de novo.');
    },
    onSuccess: invalidate,
  });
}

export function useSetRegistrationStatus() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (params: { id: string; status: 'confirmed' | 'cancelled' }): Promise<void> => {
      const res = await apiFetch(`/api/events/registrations/${params.id}`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ status: params.status }),
      });
      if (!res.ok) throw await erro(res, 'Não foi possível alterar a inscrição.');
    },
    onSuccess: invalidate,
  });
}

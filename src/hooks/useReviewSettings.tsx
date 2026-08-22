import { apiFetch } from '@/lib/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export interface ReviewSettings {
  enabled: boolean
  /** Hora do dia (0-23, BRT) em que a cron de avaliacao dispara pra empresa */
  dispatchHour: number
  googleUrl: string | null
  tripadvisorUrl: string | null
  prompt1: string | null
  prompt2: string | null
  greeting: string | null
}

export function useReviewSettings() {
  const queryClient = useQueryClient()

  const query = useQuery<ReviewSettings>({
    queryKey: ['review-settings'],
    queryFn: async () => {
      const res = await apiFetch('/api/reviews/settings')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Falha ao carregar configurações')
      }
      return res.json()
    },
  })

  const save = useMutation({
    mutationFn: async (data: Partial<ReviewSettings>) => {
      const res = await apiFetch('/api/reviews/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Falha ao salvar')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-settings'] })
      toast.success('Configurações salvas')
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao salvar configurações'),
  })

  const dispatchNow = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/reviews/dispatch', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Falha ao disparar avaliação')
      return data as { sent: number; skipped: number; failed: number }
    },
    onSuccess: (data) => {
      toast.success(
        data.sent === 1
          ? 'Disparo enviado pro fluxo de avaliação'
          : `Disparo enviado pra ${data.sent} canais`
      )
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao disparar avaliação'),
  })

  return {
    settings: query.data,
    isLoading: query.isLoading,
    save: save.mutate,
    isSaving: save.isPending,
    dispatchNow: dispatchNow.mutate,
    isDispatching: dispatchNow.isPending,
  }
}

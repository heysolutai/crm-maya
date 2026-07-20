import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export interface ReviewSettings {
  enabled: boolean
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
      const res = await fetch('/api/reviews/settings')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Falha ao carregar configurações')
      }
      return res.json()
    },
  })

  const save = useMutation({
    mutationFn: async (data: Partial<ReviewSettings>) => {
      const res = await fetch('/api/reviews/settings', {
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

  return {
    settings: query.data,
    isLoading: query.isLoading,
    save: save.mutate,
    isSaving: save.isPending,
  }
}

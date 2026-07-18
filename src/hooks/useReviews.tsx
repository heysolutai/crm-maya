import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export interface Review {
  id: string
  company_id?: string
  clientId: string | null
  conversationId: string | null
  reservationId: string | null
  rating: number
  sentiment: 'positivo' | 'neutro' | 'negativo' | string
  comment: string | null
  customerName: string | null
  source: string
  createdAt: string
}

export interface ReviewsResponse {
  data: Review[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
  summary: {
    average: number | null
    total: number
    positivo: number
    neutro: number
    negativo: number
  }
}

export type SentimentFilter = 'positivo' | 'neutro' | 'negativo' | null

interface UseReviewsParams {
  page?: number
  limit?: number
  rating?: number | null
  sentiment?: SentimentFilter
  search?: string
}

export function useReviews({
  page = 1,
  limit = 20,
  rating = null,
  sentiment = null,
  search = '',
}: UseReviewsParams = {}) {
  const queryClient = useQueryClient()

  const query = useQuery<ReviewsResponse>({
    queryKey: ['reviews', page, limit, rating, sentiment, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (rating) params.set('rating', String(rating))
      if (sentiment) params.set('sentiment', sentiment)
      if (search) params.set('search', search)

      const res = await fetch(`/api/reviews?${params}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Falha ao carregar avaliações')
      }
      return res.json()
    },
  })

  const deleteReview = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/reviews?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Falha ao remover')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] })
      toast.success('Avaliação removida')
    },
    onError: () => toast.error('Erro ao remover avaliação'),
  })

  return {
    reviews: query.data?.data ?? [],
    pagination: query.data?.pagination,
    summary: query.data?.summary,
    isLoading: query.isLoading,
    error: query.error,
    deleteReview: deleteReview.mutate,
    isDeleting: deleteReview.isPending,
  }
}

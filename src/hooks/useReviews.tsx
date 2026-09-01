import { apiFetch } from '@/lib/api/client';
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
  /** Data da reserva informada direto pelo fluxo (sem reserva no CRM) */
  reservationDate: string | null
  /** Codigo da reserva no sistema externo (ex: "F2IE8J9F") */
  reservationCode: string | null
  client: {
    fullName: string | null
    firstName: string
    lastName: string | null
    phone: string | null
  } | null
  reservation: {
    reservedFor: string | null
    partySize: number | null
  } | null
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
  /** Periodo da data da reserva, formato YYYY-MM-DD */
  dateFrom?: string
  dateTo?: string
}

export function useReviews({
  page = 1,
  limit = 20,
  rating = null,
  sentiment = null,
  search = '',
  dateFrom = '',
  dateTo = '',
}: UseReviewsParams = {}) {
  const queryClient = useQueryClient()

  const query = useQuery<ReviewsResponse>({
    queryKey: ['reviews', page, limit, rating, sentiment, search, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (rating) params.set('rating', String(rating))
      if (sentiment) params.set('sentiment', sentiment)
      if (search) params.set('search', search)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)

      const res = await apiFetch(`/api/reviews?${params}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Falha ao carregar avaliações')
      }
      return res.json()
    },
  })

  const deleteReview = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/reviews?id=${id}`, { method: 'DELETE' })
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

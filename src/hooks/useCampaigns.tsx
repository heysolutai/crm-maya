import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from './use-toast'
import { getErrorMessage } from '@/utils/getErrorMessage'

export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'failed'

export type CampaignAudienceSource = 'manual' | 'tags' | 'individual'

export interface Campaign {
  id: string
  company_id: string
  created_by_id: string | null
  whatsapp_instance_id: string | null
  whatsapp_instance: {
    id: string
    display_name: string | null
    phone_number: string | null
  } | null
  name: string
  description: string | null
  message_type: 'text' | 'image' | 'document'
  message_text: string | null
  media_url: string | null
  media_filename: string | null
  media_mime_type: string | null
  audience_source: CampaignAudienceSource
  audience_config: Record<string, any>
  min_delay_seconds: number
  max_delay_seconds: number
  daily_limit: number | null
  window_start_hour: number | null
  window_end_hour: number | null
  timezone: string | null
  status: CampaignStatus
  scheduled_for: string | null
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  recipients_total: number
  recipients_sent: number
  recipients_failed: number
  recipients_skipped: number
  created_at: string
  updated_at: string
}

export interface CampaignRecipient {
  id: string
  phone: string
  name: string | null
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped'
  sentAt: string | null
  errorMessage: string | null
  clientId: string | null
  providerMessageId: string | null
}

type AudienceConfig =
  | { source: 'manual'; phones: string[]; names?: Record<string, string> }
  | { source: 'tags'; tags: string[]; matchMode?: 'any' | 'all' }
  | { source: 'individual'; clientIds: string[] }

export interface CreateCampaignInput {
  name: string
  description?: string
  whatsappInstanceId: string
  messageType?: 'text' | 'image' | 'document'
  messageText?: string
  mediaUrl?: string
  mediaFilename?: string
  mediaMimeType?: string
  audience: AudienceConfig
  minDelaySeconds?: number
  maxDelaySeconds?: number
  dailyLimit?: number | null
  windowStartHour?: number | null
  windowEndHour?: number | null
  timezone?: string
  scheduledFor?: string
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    let err = `HTTP ${res.status}`
    try {
      const body = await res.json()
      err = body.error || err
    } catch {
      /* ignore */
    }
    throw new Error(err)
  }
  return res.json()
}

export function useCampaigns(filters?: { status?: CampaignStatus }) {
  return useQuery({
    queryKey: ['campaigns', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.status) params.set('status', filters.status)
      const res = await fetchJSON<{ data: Campaign[]; pagination: any }>(
        `/api/campaigns?${params}`
      )
      return res
    },
  })
}

export function useCampaign(id: string | null) {
  return useQuery({
    queryKey: ['campaign', id],
    queryFn: async () => {
      if (!id) return null
      return fetchJSON<Campaign>(`/api/campaigns/${id}`)
    },
    enabled: !!id,
    refetchInterval: (query) => {
      // Polling enquanto a campanha esta rodando — pra atualizar contadores em tempo real
      const data = query.state.data as Campaign | null | undefined
      if (data?.status === 'running' || data?.status === 'scheduled') {
        return 3000
      }
      return false
    },
  })
}

export function useCampaignRecipients(
  campaignId: string | null,
  filters?: { status?: CampaignRecipient['status']; page?: number; limit?: number }
) {
  return useQuery({
    queryKey: ['campaign-recipients', campaignId, filters],
    queryFn: async () => {
      if (!campaignId) return null
      const params = new URLSearchParams()
      if (filters?.status) params.set('status', filters.status)
      if (filters?.page) params.set('page', String(filters.page))
      if (filters?.limit) params.set('limit', String(filters.limit))
      return fetchJSON<{
        data: CampaignRecipient[]
        pagination: { page: number; limit: number; total: number; totalPages: number }
      }>(`/api/campaigns/${campaignId}/recipients?${params}`)
    },
    enabled: !!campaignId,
  })
}

export function useCampaignMutations() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const invalidate = (id?: string) => {
    queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    if (id) {
      queryClient.invalidateQueries({ queryKey: ['campaign', id] })
      queryClient.invalidateQueries({ queryKey: ['campaign-recipients', id] })
    }
  }

  const createCampaign = useMutation({
    mutationFn: (input: CreateCampaignInput) =>
      fetchJSON<Campaign>('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      invalidate()
      toast({ title: 'Campanha criada' })
    },
    onError: (err) => {
      toast({
        title: 'Erro ao criar campanha',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    },
  })

  const deleteCampaign = useMutation({
    mutationFn: (id: string) =>
      fetchJSON<{ success: boolean }>(`/api/campaigns/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate()
      toast({ title: 'Campanha excluida' })
    },
    onError: (err) => {
      toast({
        title: 'Erro ao excluir',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    },
  })

  const materializeRecipients = useMutation({
    mutationFn: (id: string) =>
      fetchJSON<{
        success: boolean
        resolved: number
        created: number
        total: number
      }>(`/api/campaigns/${id}/recipients`, { method: 'POST' }),
    onSuccess: (_data, id) => {
      invalidate(id)
    },
    onError: (err) => {
      toast({
        title: 'Erro ao adicionar destinatarios',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    },
  })

  const sendCampaign = useMutation({
    mutationFn: (id: string) =>
      fetchJSON<{ success: boolean; status: string }>(`/api/campaigns/${id}/send`, {
        method: 'POST',
      }),
    onSuccess: (_data, id) => {
      invalidate(id)
      toast({ title: 'Campanha iniciada' })
    },
    onError: (err) => {
      toast({
        title: 'Erro ao iniciar',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    },
  })

  const pauseCampaign = useMutation({
    mutationFn: (id: string) =>
      fetchJSON<{ success: boolean }>(`/api/campaigns/${id}/pause`, { method: 'POST' }),
    onSuccess: (_data, id) => {
      invalidate(id)
      toast({ title: 'Campanha pausada' })
    },
    onError: (err) => {
      toast({
        title: 'Erro ao pausar',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    },
  })

  const resumeCampaign = useMutation({
    mutationFn: (id: string) =>
      fetchJSON<{ success: boolean }>(`/api/campaigns/${id}/resume`, { method: 'POST' }),
    onSuccess: (_data, id) => {
      invalidate(id)
      toast({ title: 'Campanha retomada' })
    },
    onError: (err) => {
      toast({
        title: 'Erro ao retomar',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    },
  })

  const cancelCampaign = useMutation({
    mutationFn: (id: string) =>
      fetchJSON<{ success: boolean }>(`/api/campaigns/${id}/cancel`, { method: 'POST' }),
    onSuccess: (_data, id) => {
      invalidate(id)
      toast({ title: 'Campanha cancelada' })
    },
    onError: (err) => {
      toast({
        title: 'Erro ao cancelar',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    },
  })

  const uploadCsv = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/campaigns/${id}/upload-csv`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erro ao processar CSV')
      }
      return res.json() as Promise<{
        success: boolean
        parsedRows: number
        uniqueRows: number
        skipped: number
        sample: Array<{ phone: string; name?: string }>
      }>
    },
    onSuccess: (_data, vars) => {
      invalidate(vars.id)
    },
    onError: (err) => {
      toast({
        title: 'Erro ao subir CSV',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    },
  })

  return {
    createCampaign,
    deleteCampaign,
    materializeRecipients,
    sendCampaign,
    pauseCampaign,
    resumeCampaign,
    cancelCampaign,
    uploadCsv,
  }
}

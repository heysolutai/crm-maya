'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCampaigns, type Campaign, type CampaignStatus } from '@/hooks/useCampaigns'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Plus,
  Megaphone,
  Play,
  Pause,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  FileEdit,
  Eye,
} from 'lucide-react'
import { formatRelativeTime } from '@/lib/utils'

const STATUS_META: Record<CampaignStatus, { label: string; className: string; icon: any }> = {
  draft: { label: 'Rascunho', className: 'bg-muted text-muted-foreground', icon: FileEdit },
  scheduled: { label: 'Agendada', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/30', icon: Clock },
  running: { label: 'Disparando', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/30', icon: Play },
  paused: { label: 'Pausada', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30', icon: Pause },
  completed: { label: 'Concluida', className: 'bg-primary/10 text-primary ring-1 ring-primary/30', icon: CheckCircle2 },
  cancelled: { label: 'Cancelada', className: 'bg-muted text-muted-foreground', icon: XCircle },
  failed: { label: 'Falhou', className: 'bg-destructive/15 text-destructive ring-1 ring-destructive/30', icon: AlertTriangle },
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const router = useRouter()
  const meta = STATUS_META[campaign.status]
  const StatusIcon = meta.icon

  const total = campaign.recipients_total
  const sent = campaign.recipients_sent
  const failed = campaign.recipients_failed
  const skipped = campaign.recipients_skipped
  const processed = sent + failed + skipped
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0

  return (
    <Card
      className="cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
      onClick={() => router.push(`/app/campaigns/${campaign.id}`)}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm truncate">{campaign.name}</h3>
            {campaign.description && (
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                {campaign.description}
              </p>
            )}
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium shrink-0 ${meta.className}`}
          >
            <StatusIcon className="h-3 w-3" />
            {meta.label}
          </span>
        </div>

        {/* Stats / progresso */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {processed}/{total} processados
            </span>
            <span className="tabular-nums">{percent}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>✓ {sent} enviadas</span>
            {failed > 0 && <span className="text-destructive">✗ {failed} falhas</span>}
            {skipped > 0 && <span>↷ {skipped} puladas</span>}
          </div>
        </div>

        {/* Footer: agente + criado em */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t">
          <span className="truncate">
            {campaign.whatsapp_instance?.display_name || 'Sem agente'}
          </span>
          <time>{formatRelativeTime(campaign.created_at)}</time>
        </div>
      </CardContent>
    </Card>
  )
}

const STATUS_FILTERS: Array<{ key: CampaignStatus | 'all'; label: string }> = [
  { key: 'all', label: 'Todas' },
  { key: 'draft', label: 'Rascunhos' },
  { key: 'scheduled', label: 'Agendadas' },
  { key: 'running', label: 'Rodando' },
  { key: 'paused', label: 'Pausadas' },
  { key: 'completed', label: 'Concluidas' },
]

export default function Campaigns() {
  const router = useRouter()
  // useState pra filtro
  const filter = (typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('status')) as CampaignStatus | null
  const { data, isLoading, isError } = useCampaigns(
    filter ? { status: filter } : undefined
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Campanhas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Disparos em massa pra clientes. Tags, CSV ou selecao individual.
          </p>
        </div>
        <Button onClick={() => router.push('/app/campaigns/new')}>
          <Plus className="h-4 w-4 mr-2" />
          Nova campanha
        </Button>
      </div>

      {/* Filtros de status */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map((f) => {
          const isActive = (filter ?? 'all') === f.key
          return (
            <Link
              key={f.key}
              href={f.key === 'all' ? '/app/campaigns' : `/app/campaigns?status=${f.key}`}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors border whitespace-nowrap ${
                isActive
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted'
              }`}
            >
              {f.label}
            </Link>
          )
        })}
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-12 text-destructive">
          Erro ao carregar campanhas. Tenta de novo em alguns segundos.
        </div>
      ) : !data?.data || data.data.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed rounded-lg">
          <Megaphone className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <h3 className="font-semibold mb-1">Nenhuma campanha ainda</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Crie sua primeira campanha pra disparar mensagens em massa.
          </p>
          <Button onClick={() => router.push('/app/campaigns/new')}>
            <Plus className="h-4 w-4 mr-2" />
            Criar campanha
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.data.map((c) => (
            <CampaignCard key={c.id} campaign={c} />
          ))}
        </div>
      )}

      {/* Aviso de compliance no rodape */}
      <div className="text-[11px] text-muted-foreground border-t pt-3">
        <p>
          <Eye className="inline h-3 w-3 mr-1" />
          Disparos respeitam janela horaria, limite diario e opt-out dos clientes
          (resposta STOP/SAIR/CANCELAR marca cliente automaticamente).
        </p>
      </div>
    </div>
  )
}

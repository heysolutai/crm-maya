'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  useCampaign,
  useCampaignMutations,
  useCampaignRecipients,
  type CampaignStatus,
} from '@/hooks/useCampaigns'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  ArrowLeft,
  Play,
  Pause,
  XCircle,
  Trash2,
  Send,
  Loader2,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Bot,
  Users,
  Hourglass,
} from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'

const STATUS_META: Record<CampaignStatus, { label: string; className: string; icon: any }> = {
  draft: { label: 'Rascunho', className: 'bg-muted text-muted-foreground', icon: Hourglass },
  scheduled: { label: 'Agendada', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/30', icon: Clock },
  running: { label: 'Disparando', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/30', icon: Play },
  paused: { label: 'Pausada', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30', icon: Pause },
  completed: { label: 'Concluida', className: 'bg-primary/10 text-primary ring-1 ring-primary/30', icon: CheckCircle2 },
  cancelled: { label: 'Cancelada', className: 'bg-muted text-muted-foreground', icon: XCircle },
  failed: { label: 'Falhou', className: 'bg-destructive/15 text-destructive ring-1 ring-destructive/30', icon: AlertTriangle },
}

const RECIPIENT_STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  sending: 'Enviando',
  sent: 'Enviada',
  failed: 'Falhou',
  skipped: 'Pulada',
}

const RECIPIENT_STATUS_CLASS: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  sending: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  sent: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  failed: 'bg-destructive/15 text-destructive',
  skipped: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
}

interface Props {
  campaignId: string
}

export default function CampaignDetail({ campaignId }: Props) {
  const router = useRouter()
  const { data: campaign, isLoading } = useCampaign(campaignId)
  const [recipientFilter, setRecipientFilter] = useState<string | undefined>(undefined)
  const { data: recipientsPage } = useCampaignRecipients(
    campaignId,
    recipientFilter ? { status: recipientFilter as any } : undefined
  )
  const {
    sendCampaign,
    pauseCampaign,
    resumeCampaign,
    cancelCampaign,
    deleteCampaign,
    materializeRecipients,
  } = useCampaignMutations()

  const [showCancel, setShowCancel] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="text-center py-16">
        <p className="font-semibold mb-2">Campanha nao encontrada</p>
        <Button onClick={() => router.push('/app/campaigns')}>Voltar</Button>
      </div>
    )
  }

  const meta = STATUS_META[campaign.status]
  const StatusIcon = meta.icon
  const total = campaign.recipients_total
  const sent = campaign.recipients_sent
  const failed = campaign.recipients_failed
  const skipped = campaign.recipients_skipped
  const processed = sent + failed + skipped
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0

  const canStart = campaign.status === 'draft' || campaign.status === 'scheduled'
  const canPause = campaign.status === 'running' || campaign.status === 'scheduled'
  const canResume = campaign.status === 'paused'
  const canCancel = ['draft', 'scheduled', 'running', 'paused'].includes(campaign.status)
  const canDelete = !['running'].includes(campaign.status)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/app/campaigns')}
          className="-ml-2 mb-3"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Campanhas
        </Button>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-bold">{campaign.name}</h1>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
                  meta.className
                )}
              >
                <StatusIcon className="h-3.5 w-3.5" />
                {meta.label}
              </span>
            </div>
            {campaign.description && (
              <p className="text-sm text-muted-foreground mt-1">{campaign.description}</p>
            )}
          </div>

          {/* Acoes */}
          <div className="flex items-center gap-2">
            {canStart && (
              <Button
                onClick={() => sendCampaign.mutate(campaignId)}
                disabled={sendCampaign.isPending || total === 0}
              >
                {sendCampaign.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                {campaign.scheduled_for ? 'Iniciar agendamento' : 'Disparar agora'}
              </Button>
            )}
            {canPause && (
              <Button
                variant="outline"
                onClick={() => pauseCampaign.mutate(campaignId)}
                disabled={pauseCampaign.isPending}
              >
                {pauseCampaign.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Pause className="h-4 w-4 mr-2" />
                )}
                Pausar
              </Button>
            )}
            {canResume && (
              <Button
                onClick={() => resumeCampaign.mutate(campaignId)}
                disabled={resumeCampaign.isPending}
              >
                {resumeCampaign.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Retomar
              </Button>
            )}
            {canCancel && (
              <Button
                variant="outline"
                onClick={() => setShowCancel(true)}
                disabled={cancelCampaign.isPending}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
            )}
            {canDelete && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowDelete(true)}
                disabled={deleteCampaign.isPending}
                title="Excluir campanha"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Progresso */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Progresso</span>
            <span className="tabular-nums text-muted-foreground">
              {processed}/{total} ({percent}%)
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            <Stat label="Enviadas" value={sent} color="text-emerald-600" />
            <Stat label="Falhas" value={failed} color="text-destructive" />
            <Stat label="Puladas" value={skipped} color="text-amber-600" />
            <Stat label="Pendentes" value={total - processed} color="text-muted-foreground" />
          </div>
        </CardContent>
      </Card>

      {/* Detalhes da config */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 space-y-2 text-sm">
            <h3 className="font-semibold flex items-center gap-2">
              <Bot className="h-4 w-4" /> Agente
            </h3>
            <p className="text-muted-foreground">
              {campaign.whatsapp_instance?.display_name || 'Sem agente vinculado'}
              {campaign.whatsapp_instance?.phone_number && (
                <span className="font-mono"> · {campaign.whatsapp_instance.phone_number}</span>
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2 text-sm">
            <h3 className="font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" /> Audiencia
            </h3>
            <p className="text-muted-foreground">
              {campaign.audience_source === 'manual' && 'Lista manual / CSV'}
              {campaign.audience_source === 'tags' && 'Por tag de cliente'}
              {campaign.audience_source === 'individual' && 'Selecao individual'}
            </p>
            {total === 0 && (
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => materializeRecipients.mutate(campaignId)}
                disabled={materializeRecipients.isPending}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Recarregar destinatarios
              </Button>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2 text-sm">
            <h3 className="font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4" /> Rate limit
            </h3>
            <p className="text-muted-foreground">
              {campaign.min_delay_seconds}-{campaign.max_delay_seconds}s entre mensagens
            </p>
            {(campaign.window_start_hour !== null || campaign.window_end_hour !== null) && (
              <p className="text-muted-foreground">
                Janela: {campaign.window_start_hour ?? '?'}h - {campaign.window_end_hour ?? '?'}h
                ({campaign.timezone})
              </p>
            )}
            {campaign.daily_limit && (
              <p className="text-muted-foreground">
                Limite diario: {campaign.daily_limit}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2 text-sm">
            <h3 className="font-semibold">Mensagem ({campaign.message_type})</h3>
            <p className="text-muted-foreground whitespace-pre-wrap line-clamp-4 text-xs">
              {campaign.message_text || '(sem texto)'}
            </p>
            {campaign.media_url && (
              <p className="text-xs text-muted-foreground truncate">
                Midia: <a href={campaign.media_url} target="_blank" rel="noreferrer" className="text-primary underline">{campaign.media_url}</a>
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lista de destinatarios */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="font-semibold">Destinatarios</h3>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {[
                { key: undefined, label: 'Todos' },
                { key: 'pending', label: 'Pendentes' },
                { key: 'sent', label: 'Enviadas' },
                { key: 'failed', label: 'Falhas' },
                { key: 'skipped', label: 'Puladas' },
              ].map((f) => (
                <button
                  key={f.key || 'all'}
                  type="button"
                  onClick={() => setRecipientFilter(f.key)}
                  className={cn(
                    'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium border whitespace-nowrap',
                    (recipientFilter ?? undefined) === f.key
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {!recipientsPage || recipientsPage.data.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhum destinatario {recipientFilter ? `com status "${recipientFilter}"` : ''}.
            </p>
          ) : (
            <div className="space-y-1.5">
              {recipientsPage.data.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-2 p-2 rounded border text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.name || r.phone}</p>
                    <p className="font-mono text-muted-foreground">{r.phone}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.errorMessage && (
                      <span className="text-destructive text-[10px] max-w-[200px] truncate" title={r.errorMessage}>
                        {r.errorMessage}
                      </span>
                    )}
                    {r.sentAt && (
                      <time className="text-muted-foreground text-[10px]">
                        {formatRelativeTime(r.sentAt)}
                      </time>
                    )}
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-medium',
                        RECIPIENT_STATUS_CLASS[r.status]
                      )}
                    >
                      {RECIPIENT_STATUS_LABEL[r.status]}
                    </span>
                  </div>
                </div>
              ))}
              {recipientsPage.pagination.totalPages > 1 && (
                <p className="text-[11px] text-muted-foreground text-center pt-2">
                  Mostrando {recipientsPage.data.length} de {recipientsPage.pagination.total}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showCancel}
        onOpenChange={setShowCancel}
        title="Cancelar campanha?"
        description="Os destinatarios pendentes serao marcados como pulados. Os ja enviados nao sao afetados. Esta acao nao pode ser desfeita."
        confirmLabel="Cancelar campanha"
        variant="destructive"
        onConfirm={() => cancelCampaign.mutate(campaignId)}
        isLoading={cancelCampaign.isPending}
      />
      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Excluir campanha?"
        description={`A campanha "${campaign.name}" e todos os registros de destinatarios serao removidos. Esta acao nao pode ser desfeita.`}
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={async () => {
          await deleteCampaign.mutateAsync(campaignId)
          router.push('/app/campaigns')
        }}
        isLoading={deleteCampaign.isPending}
      />
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <p className={cn('text-2xl font-bold tabular-nums', color)}>{value}</p>
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
    </div>
  )
}

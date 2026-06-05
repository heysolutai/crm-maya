'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAgents } from '@/hooks/useAgents'
import { useCampaignMutations } from '@/hooks/useCampaigns'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, ArrowRight, Send, Loader2, Upload, Info, Users, FileText, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type Step = 'info' | 'audience' | 'message' | 'settings'
const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'info', label: 'Informacoes' },
  { id: 'audience', label: 'Audiencia' },
  { id: 'message', label: 'Mensagem' },
  { id: 'settings', label: 'Limites' },
]

type AudienceSource = 'manual' | 'tags' | 'individual'

export default function CampaignNew() {
  const router = useRouter()
  const { agents, isLoading: agentsLoading } = useAgents()
  const { createCampaign, materializeRecipients, sendCampaign, uploadCsv } =
    useCampaignMutations()

  const [step, setStep] = useState<Step>('info')
  const stepIdx = STEPS.findIndex((s) => s.id === step)

  // Step 1: info
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [whatsappInstanceId, setWhatsappInstanceId] = useState<string>('')

  // Step 2: audience
  const [audienceSource, setAudienceSource] = useState<AudienceSource>('manual')
  const [manualPhones, setManualPhones] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [tagMatchMode, setTagMatchMode] = useState<'any' | 'all'>('any')
  const [csvInfo, setCsvInfo] = useState<{
    name: string
    parsedRows: number
    uniqueRows: number
    skipped: number
  } | null>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  // Step 3: message
  const [messageType, setMessageType] = useState<'text' | 'image' | 'document'>('text')
  const [messageText, setMessageText] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [mediaFilename, setMediaFilename] = useState('')

  // Step 4: settings
  const [minDelay, setMinDelay] = useState(8)
  const [maxDelay, setMaxDelay] = useState(15)
  const [dailyLimit, setDailyLimit] = useState<string>('')
  const [windowStart, setWindowStart] = useState<string>('9')
  const [windowEnd, setWindowEnd] = useState<string>('18')
  const [scheduledFor, setScheduledFor] = useState<string>('')

  // Submit modes
  const [submitMode, setSubmitMode] = useState<'draft' | 'now'>('now')
  const [submitting, setSubmitting] = useState(false)

  // Helpers
  const availableAgents = (agents || []).filter((a) => a.is_active)
  const phonesArr = manualPhones
    .split(/[\n,;]/)
    .map((p) => p.trim())
    .filter(Boolean)
  const tagsArr = tagsInput
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  const canAdvanceFromInfo = name.trim().length > 0 && !!whatsappInstanceId
  const canAdvanceFromAudience =
    (audienceSource === 'manual' && (phonesArr.length > 0 || csvInfo)) ||
    (audienceSource === 'tags' && tagsArr.length > 0) ||
    audienceSource === 'individual'
  const canAdvanceFromMessage =
    (messageType === 'text' && messageText.trim().length > 0) ||
    ((messageType === 'image' || messageType === 'document') && mediaUrl.trim().length > 0)
  const canSubmit =
    canAdvanceFromInfo &&
    canAdvanceFromAudience &&
    canAdvanceFromMessage &&
    maxDelay >= minDelay

  const handleCsvSelect = async (file: File) => {
    // CSV upload precisa de campaignId existente — vamos guardar metadados
    // localmente e fazer o upload depois do create. Por ora, parseia o arquivo
    // localmente pra mostrar contador.
    const text = await file.text()
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    const sep = lines[0]?.includes(';') ? ';' : ','
    const firstCell = lines[0]?.split(sep)[0]?.trim().replace(/^"|"$/g, '') || ''
    const hasHeader = !/^[\d+(]/.test(firstCell)
    const dataLines = hasHeader ? lines.slice(1) : lines
    const phones: string[] = []
    let skipped = 0
    for (const raw of dataLines) {
      const cells = raw.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''))
      const digits = cells[0]?.replace(/\D/g, '') || ''
      if (digits.length >= 10 && digits.length <= 15) {
        phones.push(digits)
      } else {
        skipped++
      }
    }
    const unique = Array.from(new Set(phones))
    setCsvInfo({ name: file.name, parsedRows: phones.length, uniqueRows: unique.length, skipped })
    setManualPhones(unique.join('\n'))
  }

  const buildAudience = () => {
    if (audienceSource === 'manual') {
      return { source: 'manual' as const, phones: phonesArr }
    }
    if (audienceSource === 'tags') {
      return { source: 'tags' as const, tags: tagsArr, matchMode: tagMatchMode }
    }
    return { source: 'individual' as const, clientIds: [] }
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      // 1. Criar a campanha
      const created = await createCampaign.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        whatsappInstanceId,
        messageType,
        messageText: messageText || undefined,
        mediaUrl: mediaUrl || undefined,
        mediaFilename: mediaFilename || undefined,
        audience: buildAudience(),
        minDelaySeconds: minDelay,
        maxDelaySeconds: maxDelay,
        dailyLimit: dailyLimit ? parseInt(dailyLimit, 10) : null,
        windowStartHour: windowStart ? parseInt(windowStart, 10) : null,
        windowEndHour: windowEnd ? parseInt(windowEnd, 10) : null,
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
      })

      // 2. Materializar destinatarios
      await materializeRecipients.mutateAsync(created.id)

      // 3. Se modo "now", dispara
      if (submitMode === 'now' && audienceSource !== 'individual') {
        await sendCampaign.mutateAsync(created.id)
      }

      router.push(`/app/campaigns/${created.id}`)
    } catch {
      // Toasts ja tratados nos hooks
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push('/app/campaigns')} className="-ml-2 mb-3">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Campanhas
        </Button>
        <h1 className="text-2xl md:text-3xl font-bold">Nova campanha</h1>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {STEPS.map((s, idx) => {
          const isActive = s.id === step
          const isPast = idx < stepIdx
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap',
                isActive
                  ? 'bg-primary text-primary-foreground border-primary'
                  : isPast
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'bg-background text-muted-foreground border-border'
              )}
            >
              <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-current/20 text-[10px]">
                {idx + 1}
              </span>
              {s.label}
            </button>
          )
        })}
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          {step === 'info' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="name">Nome da campanha *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Promocao de Junho"
                  maxLength={255}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Descricao (interno)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Anotacao opcional pra a equipe"
                  maxLength={2000}
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="agent">Agente WhatsApp que envia *</Label>
                <Select value={whatsappInstanceId} onValueChange={setWhatsappInstanceId} disabled={agentsLoading}>
                  <SelectTrigger id="agent">
                    <SelectValue placeholder={agentsLoading ? 'Carregando...' : 'Selecione um agente'} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAgents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.display_name} {a.phone_number ? `· ${a.phone_number}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!agentsLoading && availableAgents.length === 0 && (
                  <p className="text-xs text-destructive">
                    Nenhum agente ativo. Crie um em /app/agents antes.
                  </p>
                )}
              </div>
            </>
          )}

          {step === 'audience' && (
            <>
              <div className="space-y-2">
                <Label>Fonte dos destinatarios</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'manual', label: 'CSV / Lista manual', icon: Upload },
                      { id: 'tags', label: 'Por tag', icon: Users },
                      { id: 'individual', label: 'Selecao individual', icon: FileText },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAudienceSource(opt.id)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs',
                        audienceSource === opt.id
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border hover:border-primary/40'
                      )}
                    >
                      <opt.icon className="h-5 w-5" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {audienceSource === 'manual' && (
                <>
                  <div className="space-y-2">
                    <Label>Upload CSV</Label>
                    <input
                      ref={csvInputRef}
                      type="file"
                      accept=".csv,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleCsvSelect(file)
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => csvInputRef.current?.click()}
                      className="w-full justify-start"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {csvInfo ? csvInfo.name : 'Escolher arquivo CSV'}
                    </Button>
                    {csvInfo && (
                      <p className="text-xs text-muted-foreground">
                        {csvInfo.uniqueRows} telefones unicos · {csvInfo.skipped} descartados
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="manualPhones">Ou cole/edite telefones (um por linha)</Label>
                    <Textarea
                      id="manualPhones"
                      value={manualPhones}
                      onChange={(e) => setManualPhones(e.target.value)}
                      placeholder={'5511999999999\n5511988888888\n...'}
                      rows={8}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      {phonesArr.length} telefone(s)
                    </p>
                  </div>
                </>
              )}

              {audienceSource === 'tags' && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="tags">Tags (separadas por virgula)</Label>
                    <Input
                      id="tags"
                      value={tagsInput}
                      onChange={(e) => setTagsInput(e.target.value)}
                      placeholder="vip, lead-quente, cliente-ativo"
                    />
                    {tagsArr.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {tagsArr.map((t) => (
                          <Badge key={t} variant="secondary">{t}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Filtro</Label>
                    <Select value={tagMatchMode} onValueChange={(v: any) => setTagMatchMode(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Cliente com QUALQUER uma das tags</SelectItem>
                        <SelectItem value="all">Cliente com TODAS as tags</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {audienceSource === 'individual' && (
                <div className="rounded-lg border border-dashed p-4 bg-muted/30 text-sm">
                  <p className="font-medium mb-1">Selecao individual</p>
                  <p className="text-xs text-muted-foreground">
                    Esta opcao requer que voce escolha clientes a partir da pagina /app/clients
                    (botao &quot;Enviar campanha&quot; com selecao multipla — em breve). Por
                    enquanto, use &quot;CSV / Lista manual&quot; ou &quot;Por tag&quot;.
                  </p>
                </div>
              )}
            </>
          )}

          {step === 'message' && (
            <>
              <div className="space-y-2">
                <Label>Tipo de mensagem</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'text', label: 'Texto', icon: FileText },
                      { id: 'image', label: 'Imagem', icon: ImageIcon },
                      { id: 'document', label: 'Documento', icon: FileText },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setMessageType(opt.id)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs',
                        messageType === opt.id
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border hover:border-primary/40'
                      )}
                    >
                      <opt.icon className="h-5 w-5" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {(messageType === 'image' || messageType === 'document') && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="mediaUrl">URL da {messageType === 'image' ? 'imagem' : 'documento'} *</Label>
                    <Input
                      id="mediaUrl"
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                  {messageType === 'document' && (
                    <div className="space-y-1.5">
                      <Label htmlFor="mediaFilename">Nome do arquivo (opcional)</Label>
                      <Input
                        id="mediaFilename"
                        value={mediaFilename}
                        onChange={(e) => setMediaFilename(e.target.value)}
                        placeholder="catalogo-junho.pdf"
                      />
                    </div>
                  )}
                </>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="messageText">
                  {messageType === 'text' ? 'Texto *' : 'Legenda (caption)'}
                </Label>
                <Textarea
                  id="messageText"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Ola {{nome}}, temos uma novidade pra voce..."
                  rows={6}
                  maxLength={4096}
                />
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Use <code className="font-mono">{'{{nome}}'}</code> e{' '}
                  <code className="font-mono">{'{{telefone}}'}</code> pra personalizar
                </p>
              </div>
            </>
          )}

          {step === 'settings' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="minDelay">Delay minimo (s)</Label>
                  <Input
                    id="minDelay"
                    type="number"
                    min={1}
                    max={3600}
                    value={minDelay}
                    onChange={(e) => setMinDelay(parseInt(e.target.value || '8', 10))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="maxDelay">Delay maximo (s)</Label>
                  <Input
                    id="maxDelay"
                    type="number"
                    min={1}
                    max={3600}
                    value={maxDelay}
                    onChange={(e) => setMaxDelay(parseInt(e.target.value || '15', 10))}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                Worker envia uma mensagem a cada delay aleatorio entre min e max
                (humaniza, evita bloqueio do WhatsApp). Default 8-15s.
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="dailyLimit">Limite diario (opcional)</Label>
                <Input
                  id="dailyLimit"
                  type="number"
                  min={1}
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  placeholder="Ex: 200 (vazio = sem limite)"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="windowStart">Janela: hora inicio (0-23)</Label>
                  <Input
                    id="windowStart"
                    type="number"
                    min={0}
                    max={23}
                    value={windowStart}
                    onChange={(e) => setWindowStart(e.target.value)}
                    placeholder="9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="windowEnd">Janela: hora fim (0-23)</Label>
                  <Input
                    id="windowEnd"
                    type="number"
                    min={0}
                    max={23}
                    value={windowEnd}
                    onChange={(e) => setWindowEnd(e.target.value)}
                    placeholder="18"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                Hora local (America/Sao_Paulo). Fora desse intervalo o worker espera.
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="scheduledFor">Agendar para (opcional)</Label>
                <Input
                  id="scheduledFor"
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Vazio = comeca quando voce clicar &quot;Disparar agora&quot;.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Navegacao */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setStep(STEPS[Math.max(0, stepIdx - 1)].id)}
          disabled={stepIdx === 0}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Anterior
        </Button>

        {stepIdx < STEPS.length - 1 ? (
          <Button
            onClick={() => setStep(STEPS[stepIdx + 1].id)}
            disabled={
              (step === 'info' && !canAdvanceFromInfo) ||
              (step === 'audience' && !canAdvanceFromAudience) ||
              (step === 'message' && !canAdvanceFromMessage)
            }
          >
            Proximo
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSubmitMode('draft')
                handleSubmit()
              }}
              disabled={!canSubmit || submitting}
            >
              {submitting && submitMode === 'draft' && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Salvar rascunho
            </Button>
            <Button
              onClick={() => {
                setSubmitMode('now')
                handleSubmit()
              }}
              disabled={!canSubmit || submitting}
            >
              {submitting && submitMode === 'now' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {scheduledFor ? 'Agendar' : 'Disparar agora'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

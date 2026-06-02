import { Worker, Job } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type CampaignTickJob, enqueueCampaignTick } from '../queues'
import { prisma } from '@/lib/db'
import { getAdapter, hasAdapter } from '@/lib/channels/registry'
import { isChannelType } from '@/lib/channels/types'

let worker: Worker | null = null

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE

/**
 * Substitui variaveis `{{nome}}` e `{{telefone}}` no texto.
 * Fallback: usa o telefone se nome for null/vazio.
 */
function applyVariables(template: string, recipient: { name: string | null; phone: string }): string {
  const name = (recipient.name || '').trim() || 'cliente'
  return template
    .replace(/\{\{\s*nome\s*\}\}/gi, name)
    .replace(/\{\{\s*telefone\s*\}\}/gi, recipient.phone)
}

/**
 * Hora atual no timezone da campanha. Usa Intl.DateTimeFormat — sem dep externa.
 * Retorna 0-23.
 */
function currentHourInTimezone(timezone: string | null): number {
  const tz = timezone || 'America/Sao_Paulo'
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    })
    return parseInt(fmt.format(new Date()), 10)
  } catch {
    // Timezone invalido — fallback pra UTC
    return new Date().getUTCHours()
  }
}

/**
 * Quantos ms ate o proximo `windowStartHour` no timezone dado.
 * Usado pra agendar o tick pra quando a janela abrir de novo.
 */
function msUntilNextWindowOpen(windowStartHour: number, timezone: string | null): number {
  const tz = timezone || 'America/Sao_Paulo'
  const now = new Date()
  // Calcula offset atual do timezone em horas
  const tzNow = new Date(now.toLocaleString('en-US', { timeZone: tz }))
  const offsetMs = tzNow.getTime() - now.getTime()
  // "Agora" no timezone local, tratado como UTC
  const tzNowAsUtc = new Date(now.getTime() + offsetMs)
  // Proxima ocorrencia de windowStartHour:00 no timezone
  const next = new Date(tzNowAsUtc)
  next.setUTCHours(windowStartHour, 0, 0, 0)
  if (next.getTime() <= tzNowAsUtc.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1) // amanha
  }
  return next.getTime() - tzNowAsUtc.getTime()
}

/**
 * Janela horaria considerando que pode cruzar meia-noite (ex: 22h-6h).
 * Null em ambos = sem janela (24h liberado).
 */
function isInWindow(hour: number, startHour: number | null, endHour: number | null): boolean {
  if (startHour === null || endHour === null) return true
  if (startHour === endHour) return true // janela "zero" tratada como liberada
  if (startHour < endHour) {
    return hour >= startHour && hour < endHour
  }
  // Cruza meia-noite: ex 22-6 => liberado se hora >=22 OU <6
  return hour >= startHour || hour < endHour
}

/**
 * Quantos messages essa campanha ja enviou HOJE (timezone da campanha).
 * Usa sent_at >= inicio-do-dia-no-tz.
 */
async function countSentToday(campaignId: string, timezone: string | null): Promise<number> {
  const tz = timezone || 'America/Sao_Paulo'
  const now = new Date()
  // Inicio do dia no timezone, convertido pra Date UTC pra query
  const tzMidnightStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now) // "YYYY-MM-DD"
  const startOfDay = new Date(`${tzMidnightStr}T00:00:00`)
  // Compensa offset do timezone: pegar a meia-noite TZ em UTC
  // Workaround: usa Intl pra calcular offset
  const tzNow = new Date(now.toLocaleString('en-US', { timeZone: tz }))
  const offsetMs = now.getTime() - tzNow.getTime()
  const startOfDayUtc = new Date(startOfDay.getTime() + offsetMs)

  return prisma.campaignRecipient.count({
    where: {
      campaignId,
      status: 'sent',
      sentAt: { gte: startOfDayUtc },
    },
  })
}

interface CampaignContext {
  id: string
  companyId: string
  status: string
  whatsappInstanceId: string | null
  messageType: string
  messageText: string | null
  mediaUrl: string | null
  mediaFilename: string | null
  mediaMimeType: string | null
  minDelaySeconds: number
  maxDelaySeconds: number
  dailyLimit: number | null
  windowStartHour: number | null
  windowEndHour: number | null
  timezone: string | null
  scheduledFor: Date | null
}

/**
 * Envia UMA mensagem via o agente vinculado a campanha. Retorna providerMessageId
 * em caso de sucesso, ou throw em caso de falha (o caller decide se retry/falha).
 */
async function sendOne(
  campaign: CampaignContext,
  recipient: { id: string; phone: string; name: string | null }
): Promise<{ providerMessageId: string }> {
  if (!campaign.whatsappInstanceId) {
    throw new Error('Campanha sem agente vinculado')
  }
  const agent = await prisma.whatsappInstance.findFirst({
    where: { id: campaign.whatsappInstanceId, companyId: campaign.companyId },
  })
  if (!agent) throw new Error('Agente nao encontrado')
  if (!isChannelType(agent.channelType) || !hasAdapter(agent.channelType as any)) {
    throw new Error(`Canal ${agent.channelType} sem adapter`)
  }
  const adapter = getAdapter(agent.channelType as any)
  const text = applyVariables(campaign.messageText || '', recipient)

  // V1: so texto via adapter. Imagem/documento sao enviados via fetch direto
  // pro send/media da UAZapi (adapters ainda nao tem sendMedia padronizado).
  if (campaign.messageType === 'text') {
    const result = await adapter.sendText(
      {
        id: agent.id,
        companyId: agent.companyId,
        channelType: agent.channelType as any,
        instanceName: agent.instanceName,
        displayName: agent.displayName,
        phoneNumber: agent.phoneNumber,
        apiUrl: agent.apiUrl,
        instanceApiKey: agent.instanceApiKey,
        channelConfig: agent.channelConfig as any,
        metadata: agent.metadata as any,
      },
      { to: recipient.phone, text }
    )
    return { providerMessageId: String(result.providerMessageId || '') }
  }

  // Midia: chama direto o endpoint /send/media da UAZapi
  if (!agent.apiUrl || !agent.instanceApiKey) {
    throw new Error('Agente sem apiUrl/instanceApiKey configurado')
  }
  const mediaType = campaign.messageType === 'image' ? 'image' : 'document'
  const res = await fetch(`${agent.apiUrl.replace(/\/+$/, '')}/send/media`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      token: agent.instanceApiKey,
    },
    body: JSON.stringify({
      number: recipient.phone,
      type: mediaType,
      file: campaign.mediaUrl,
      text,
      docName: campaign.mediaFilename || undefined,
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`send/media ${res.status}: ${errText.substring(0, 200)}`)
  }
  const data = await res.json()
  const providerMessageId = String(
    data?.message_id || data?.id || data?.key?.id || ''
  )
  return { providerMessageId }
}

/**
 * Processa UM tick: tenta enviar 1 recipient. Re-enfileira proximo tick com delay
 * adequado (delay normal, esperar janela, esperar amanha) ou marca completed.
 */
async function processCampaignTick(job: Job<CampaignTickJob>) {
  const { campaignId } = job.data

  let campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
  })
  if (!campaign) {
    console.warn(`[Campaign Worker] Campanha ${campaignId} nao encontrada, abortando`)
    return
  }

  // Promove 'scheduled' -> 'running' quando o tick agendado dispara.
  // Comparamos com scheduledFor pra evitar promover por engano se algum
  // outro caminho enfileirou tick antes da hora.
  if (campaign.status === 'scheduled') {
    const now = new Date()
    if (!campaign.scheduledFor || campaign.scheduledFor <= now) {
      campaign = await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'running', startedAt: now },
      })
      console.log(`[Campaign Worker] Campanha ${campaignId} promovida scheduled -> running`)
    } else {
      // Tick chegou cedo demais — reagenda pra hora certa
      await enqueueCampaignTick({ campaignId }, campaign.scheduledFor.getTime() - now.getTime())
      return
    }
  }

  // Honra estado: so processa se 'running' (paused/cancelled/completed param aqui)
  if (campaign.status !== 'running') {
    console.log(`[Campaign Worker] Campanha ${campaignId} status=${campaign.status}, nao processa`)
    return
  }

  const ctx: CampaignContext = campaign

  // 1. Janela horaria
  const hour = currentHourInTimezone(ctx.timezone)
  if (!isInWindow(hour, ctx.windowStartHour, ctx.windowEndHour)) {
    const delayMs = msUntilNextWindowOpen(ctx.windowStartHour!, ctx.timezone)
    console.log(
      `[Campaign Worker] ${campaignId} fora da janela (hora=${hour}, janela=${ctx.windowStartHour}-${ctx.windowEndHour}), reagendando em ${Math.round(delayMs / MINUTE)}min`
    )
    await enqueueCampaignTick({ campaignId }, delayMs)
    return
  }

  // 2. Limite diario
  if (ctx.dailyLimit !== null) {
    const sentToday = await countSentToday(campaignId, ctx.timezone)
    if (sentToday >= ctx.dailyLimit) {
      const delayMs = ctx.windowStartHour !== null
        ? msUntilNextWindowOpen(ctx.windowStartHour, ctx.timezone)
        : 24 * HOUR
      console.log(
        `[Campaign Worker] ${campaignId} limite diario batido (${sentToday}/${ctx.dailyLimit}), reagendando em ${Math.round(delayMs / HOUR)}h`
      )
      await enqueueCampaignTick({ campaignId }, delayMs)
      return
    }
  }

  // 3. Proximo recipient pendente
  const recipient = await prisma.campaignRecipient.findFirst({
    where: { campaignId, status: 'pending' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, phone: true, name: true, clientId: true },
  })

  if (!recipient) {
    // Acabou — marca completed
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'completed', completedAt: new Date() },
    })
    console.log(`[Campaign Worker] Campanha ${campaignId} completa`)
    return
  }

  // 4. Check opt-out (via client ou via phone match)
  let isOptedOut = false
  if (recipient.clientId) {
    const client = await prisma.client.findUnique({
      where: { id: recipient.clientId },
      select: { optedOut: true },
    })
    isOptedOut = !!client?.optedOut
  } else {
    // Sem clientId — verifica por telefone (cliente pode ter sido criado depois)
    const client = await prisma.client.findFirst({
      where: { companyId: ctx.companyId, phone: recipient.phone, optedOut: true },
      select: { id: true },
    })
    isOptedOut = !!client
  }

  if (isOptedOut) {
    await prisma.$transaction([
      prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: 'skipped', errorMessage: 'Cliente opted out' },
      }),
      prisma.campaign.update({
        where: { id: campaignId },
        data: { recipientsSkipped: { increment: 1 } },
      }),
    ])
    console.log(`[Campaign Worker] ${campaignId} skip ${recipient.phone} (opt-out)`)
    // Sem delay — opt-out nao consome cota
    await enqueueCampaignTick({ campaignId }, 0)
    return
  }

  // 5. Envia
  try {
    // Marca sending
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: 'sending' },
    })

    const sendResult = await sendOne(ctx, recipient)

    await prisma.$transaction([
      prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
          providerMessageId: sendResult.providerMessageId || null,
        },
      }),
      prisma.campaign.update({
        where: { id: campaignId },
        data: { recipientsSent: { increment: 1 } },
      }),
    ])
    console.log(`[Campaign Worker] ${campaignId} sent ${recipient.phone}`)
  } catch (err) {
    const msg = (err as Error).message || 'Erro desconhecido'
    await prisma.$transaction([
      prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: 'failed', errorMessage: msg.substring(0, 500) },
      }),
      prisma.campaign.update({
        where: { id: campaignId },
        data: { recipientsFailed: { increment: 1 } },
      }),
    ])
    console.error(`[Campaign Worker] ${campaignId} falha ${recipient.phone}:`, msg)
  }

  // 6. Re-enfileira proximo tick com delay aleatorio entre min e max
  const minMs = ctx.minDelaySeconds * SECOND
  const maxMs = ctx.maxDelaySeconds * SECOND
  // Jitter uniforme. Note: nao usamos crypto-random — disparo nao precisa
  // de aleatoriedade segura, so de espacamento variavel.
  const delayMs = Math.floor(minMs + (Math.random() * (maxMs - minMs)))
  await enqueueCampaignTick({ campaignId }, delayMs)
}

export function startCampaignTickWorker() {
  if (worker) return

  worker = new Worker<CampaignTickJob>(
    QUEUE_NAMES.CAMPAIGN_TICK,
    processCampaignTick,
    {
      connection: getRedisConnection(),
      // Cada campanha tem jobId unico (`campaign:<id>`) e cada tick agenda o
      // proximo sozinho — ou seja, NAO ha risco de 2 ticks da MESMA campanha
      // rodarem ao mesmo tempo. Concurrency=4 permite ate 4 campanhas
      // simultaneas em agentes diferentes sem afetar o rate limit individual.
      concurrency: 4,
    }
  )

  worker.on('failed', (job, err) => {
    console.error(`[Campaign Worker] tick ${job?.id} falhou:`, err.message)
  })
  worker.on('error', (err) => {
    console.error('[Campaign Worker] erro:', err)
  })

  console.log('[Queue] Campaign tick worker iniciado')
}

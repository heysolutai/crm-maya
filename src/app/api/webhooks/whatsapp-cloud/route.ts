import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { enqueueInboundMessage } from '@/lib/queue'
import { publishEvent } from '@/lib/realtime'
import { verifyCovercutSignature } from '@/lib/channels/covercut'
import { obj, str, toPipelinePayload, type Json } from '@/lib/channels/covercut-inbound'
import { cloudInstanceName, fetchCloudWebhookSecret } from '@/lib/channels/adapters/whatsapp-cloud'
import { marcarFalhaEnvio } from '@/lib/api/whatsapp'

/**
 * Receiver do WhatsApp Cloud (Covercut).
 *
 * Envelope da Covercut (nao e o formato cru da Meta):
 *   { event, direction, from_number_id, contact: { wa_id, name, user_id },
 *     message: { id, type, text: "Oi" | ..., image: {...}, context, ... },
 *     status: { id, status, recipient }, echo_source, account_update }
 *
 * Seguranca: X-BSP-Signature = HMAC-SHA256 do corpo CRU com o webhook_secret
 * do numero (guardado em inbox.instanceApiKey). Sem inbox ou sem secret, recusa.
 *
 * Mensagens (recebidas e enviadas pelo celular) sao traduzidas pro mesmo
 * formato interno da UazAPI e entram na MESMA fila/pipeline: cliente,
 * conversa, pausa da IA, n8n, follow-up, midia e transcricao funcionam igual
 * em todos os canais sem duplicar 1500 linhas de logica.
 */

const READ_STATUS: Record<string, 'sent' | 'delivered' | 'read'> = {
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
}

/**
 * status.errors[0] da Meta -> texto cru do motivo, ex.:
 * "131047 Re-engagement message: More than 24 hours have passed...".
 * O codigo vai na frente: e por ele que o tradutor (lib/erros/envio) acerta.
 */
function motivoDaFalhaCloud(erro: Json | null): string {
  if (!erro) return 'WhatsApp Cloud: envio falhou (sem motivo informado)'
  const codigo = typeof erro.code === 'number' || typeof erro.code === 'string' ? String(erro.code) : ''
  const titulo = str(erro.title) || ''
  const mensagem = str(erro.message) || ''
  const detalhes = str(obj(erro.error_data)?.details) || ''
  const partes = [codigo, titulo].filter(Boolean).join(' ')
  const extra = [mensagem && mensagem !== titulo ? mensagem : '', detalhes && detalhes !== mensagem ? detalhes : '']
    .filter(Boolean)
    .join(' | ')
  const texto = [partes, extra].filter(Boolean).join(': ')
  return texto ? `WhatsApp Cloud ${texto}` : 'WhatsApp Cloud: envio falhou (sem motivo informado)'
}

async function handleStatus(companyId: string, envelope: Json): Promise<number> {
  const status = obj(envelope.status)
  const wamid = str(status?.id)
  const value = str(status?.status)
  if (!wamid || !value) return 0

  if (value === 'failed') {
    const errors = Array.isArray(status?.errors) ? status?.errors : []
    const motivo = motivoDaFalhaCloud(obj(errors[0]))
    console.warn('[WA Cloud] envio falhou', wamid, motivo)
    const alvos = await prisma.message.findMany({
      where: { uazMessageId: wamid, conversation: { companyId } },
      select: { id: true },
    })
    // readStatus 'failed' + send_error (codigo + titulo da Meta) mesclado no
    // metadata + message:update pra bolha ficar vermelha na hora.
    for (const m of alvos) await marcarFalhaEnvio(m.id, motivo, { companyId })
    return alvos.length
  }

  const readStatus = READ_STATUS[value]
  if (!readStatus) return 0

  const result = await prisma.message.updateMany({
    where: { uazMessageId: wamid, conversation: { companyId } },
    data: { readStatus, ...(readStatus === 'read' ? { readAt: new Date() } : {}) },
  })

  if (result.count > 0) {
    const updated = await prisma.message.findMany({
      where: { uazMessageId: wamid, conversation: { companyId } },
      select: { id: true, conversationId: true },
    })
    await Promise.all(
      updated.map((m) =>
        publishEvent(companyId, {
          type: 'message:update',
          conversationId: m.conversationId,
          messageId: m.id,
          patch: { readStatus, ...(readStatus === 'read' ? { readAt: new Date().toISOString() } : {}) },
        }),
      ),
    )
  }
  return result.count
}

const agentIdSchema = z.string().uuid()

/**
 * Releitura do secret do webhook do numero, no maximo 1x a cada 5 min por
 * inbox: request com assinatura falsa nao pode virar enxurrada de chamadas
 * pra Covercut.
 */
const SECRET_REFRESH_INTERVAL_MS = 5 * 60 * 1000
const ultimaReleitura = new Map<string, number>()

async function refreshWebhookSecret(inbox: {
  id: string
  instanceApiKey: string | null
  channelConfig: unknown
}): Promise<string | null> {
  const agora = Date.now()
  if (agora - (ultimaReleitura.get(inbox.id) ?? 0) < SECRET_REFRESH_INTERVAL_MS) return null
  ultimaReleitura.set(inbox.id, agora)

  const config = obj(inbox.channelConfig) || {}
  const phoneNumberId = str(config.phoneNumberId)
  const webhookUrl = str(config.webhookUrl)
  if (!phoneNumberId || !webhookUrl) return null

  try {
    const secret = await fetchCloudWebhookSecret(phoneNumberId, webhookUrl)
    if (!secret || secret === inbox.instanceApiKey) return null
    await prisma.inbox.update({ where: { id: inbox.id }, data: { instanceApiKey: secret } })
    console.warn('[WA Cloud] secret do webhook atualizado automaticamente para inbox', inbox.id)
    return secret
  } catch (error) {
    console.error('[WA Cloud] falha ao reler secret do webhook', inbox.id, error)
    return null
  }
}

export async function POST(req: NextRequest) {
  // Corpo CRU: a assinatura e sobre os bytes exatos recebidos.
  const rawBody = await req.text()

  let envelope: Json
  try {
    const parsed: unknown = JSON.parse(rawBody)
    const asObj = obj(parsed)
    if (!asObj) throw new Error('payload nao e objeto')
    envelope = asObj
  } catch {
    return NextResponse.json({ error: 'Payload invalido' }, { status: 400 })
  }

  try {
    // Inbox: pelo numero que recebeu; fallback pro agentId da URL.
    const phoneNumberId = str(envelope.from_number_id)?.replace(/\D/g, '')
    const agentIdParam = agentIdSchema.safeParse(req.nextUrl.searchParams.get('agentId'))

    const inbox = phoneNumberId
      ? await prisma.inbox.findFirst({
          where: { instanceName: cloudInstanceName(phoneNumberId), channelType: 'whatsapp_cloud' },
          select: { id: true, companyId: true, instanceName: true, instanceApiKey: true, isActive: true, channelConfig: true },
        })
      : agentIdParam.success
        ? await prisma.inbox.findFirst({
            where: { id: agentIdParam.data, channelType: 'whatsapp_cloud' },
            select: { id: true, companyId: true, instanceName: true, instanceApiKey: true, isActive: true, channelConfig: true },
          })
        : null

    if (!inbox) {
      return NextResponse.json({ error: 'Inbox nao encontrada' }, { status: 404 })
    }
    const signature = req.headers.get('x-bsp-signature')
    if (!signature) {
      return NextResponse.json({ error: 'Assinatura ausente' }, { status: 401 })
    }

    let valid = verifyCovercutSignature(rawBody, signature, inbox.instanceApiKey)
    if (!valid) {
      // Secret pode ter mudado (webhook mexido no painel, numero reconectado):
      // busca o atual na Covercut e confere de novo. O secret vem da API
      // autenticada, nunca do request.
      const fresh = await refreshWebhookSecret(inbox)
      valid = !!fresh && verifyCovercutSignature(rawBody, signature, fresh)
    }
    if (!valid) {
      if (!inbox.instanceApiKey) {
        return NextResponse.json({ error: 'Webhook nao configurado' }, { status: 503 })
      }
      console.warn('[WA Cloud] assinatura invalida para inbox', inbox.id)
      return NextResponse.json({ error: 'Assinatura invalida' }, { status: 401 })
    }

    if (!inbox.isActive) {
      return NextResponse.json({ status: 'ignored', reason: 'inbox_inactive' })
    }

    const config = obj(inbox.channelConfig) || {}
    const inboxPhoneNumberId = str(config.phoneNumberId) || phoneNumberId || ''
    const event = str(envelope.event) || ''

    switch (event) {
      case 'message':
      case 'echo': {
        const isEcho = event === 'echo'
        // Echo pela API = nos mesmos enviamos (ja salvo no send-*). So o que
        // saiu do CELULAR (coexistencia) interessa: vira mensagem do
        // atendente e pausa a IA no pipeline.
        if (isEcho && envelope.echo_source !== 'phone') {
          return NextResponse.json({ status: 'ignored', reason: 'api_echo' })
        }
        const payload = toPipelinePayload({
          instanceName: inbox.instanceName,
          phoneNumberId: inboxPhoneNumberId,
          envelope,
          fromMe: isEcho,
        })
        if (!payload) {
          return NextResponse.json({ status: 'ignored', reason: 'unsupported_message' })
        }
        await enqueueInboundMessage({ rawPayload: payload, receivedAt: new Date().toISOString() })
        return NextResponse.json({ success: true })
      }

      case 'status': {
        const updated = await handleStatus(inbox.companyId, envelope)
        return NextResponse.json({ success: true, updated })
      }

      case 'account_update': {
        const update = obj(envelope.account_update)
        const what = str(update?.event) || ''
        console.warn('[WA Cloud] account_update', inbox.id, what)
        if (/OFFBOARD|DISCONNECT|BANNED|DELETED/i.test(what)) {
          await prisma.inbox.update({
            where: { id: inbox.id },
            data: { status: 'disconnected', errorMessage: `WhatsApp Cloud: ${what}` },
          })
        }
        return NextResponse.json({ success: true })
      }

      default:
        // history (sincronizacao de coexistencia), call, grupos, etc.
        return NextResponse.json({ status: 'ignored', reason: event || 'unknown_event' })
    }
  } catch (error) {
    console.error('[WA Cloud] erro ao processar webhook:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

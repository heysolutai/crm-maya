import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * Webhook receiver para Evolution API.
 *
 * URL gravada no provider durante provision: /api/webhooks/evolution?agentId={id}
 *
 * STATUS: Stub minimo. Hoje:
 *  - Atualiza status do agente em CONNECTION_UPDATE
 *  - Atualiza phoneNumber em CONNECTION_UPDATE quando disponivel
 *  - Loga MESSAGES_UPSERT (mensagens recebidas) — integracao com inbound-message
 *    worker entra na proxima fase, junto com refactor do webhook UazAPI.
 *
 * Eventos comuns recebidos:
 *  - CONNECTION_UPDATE   { instance, data: { state, statusReason, ... } }
 *  - QRCODE_UPDATED      { instance, data: { qrcode: { base64, code } } }
 *  - MESSAGES_UPSERT     { instance, data: { key: {remoteJid, id, fromMe}, message, messageType, pushName } }
 *  - SEND_MESSAGE        outgoing — usado pra confirmar envio
 */

export async function POST(req: NextRequest) {
  try {
    const agentId = req.nextUrl.searchParams.get('agentId')
    if (!agentId) {
      console.warn('[webhook:evolution] agentId ausente na query')
      return NextResponse.json({ error: 'Missing agentId' }, { status: 400 })
    }

    const payload = await req.json().catch(() => null)
    if (!payload) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const event: string = payload.event || payload.type || ''
    const data = payload.data || {}

    // Resolve o agente — IDOR-safe por ser ID gerado por nos
    const agent = await prisma.whatsappInstance.findUnique({ where: { id: agentId } })
    if (!agent) {
      console.warn(`[webhook:evolution] agente ${agentId} nao encontrado`)
      return NextResponse.json({ ok: true })
    }

    switch (event) {
      case 'CONNECTION_UPDATE': {
        const state = data.state ?? data.status ?? null
        const updates: any = {}

        if (state === 'open') {
          updates.status = 'connected'
          updates.qrCode = null
          updates.lastConnectedAt = new Date()
          updates.errorMessage = null
        } else if (state === 'close' || state === 'closed' || state === 'logout') {
          updates.status = 'disconnected'
          updates.qrCode = null
        } else if (state === 'connecting') {
          updates.status = 'connecting'
        }

        // Algumas versoes do Evolution mandam o JID do owner em CONNECTION_UPDATE
        const jid: string | undefined =
          data.wuid || data.user?.id || data.instance?.user?.id || data.profile?.id
        if (jid) {
          const phone = String(jid).replace(/@.*$/, '').replace(/\D/g, '')
          if (phone.length >= 10) updates.phoneNumber = phone
        }

        if (Object.keys(updates).length > 0) {
          await prisma.whatsappInstance.update({ where: { id: agentId }, data: updates })
        }
        break
      }

      case 'QRCODE_UPDATED': {
        const code: string | undefined = data?.qrcode?.base64 || data?.qrcode?.code
        if (code) {
          const qrCode = code.startsWith('data:image') ? code : `data:image/png;base64,${code}`
          await prisma.whatsappInstance.update({
            where: { id: agentId },
            data: { qrCode, status: 'connecting' },
          })
        }
        break
      }

      case 'MESSAGES_UPSERT': {
        // TODO Fase 2: enfileirar inbound-message e processar como UazAPI faz hoje.
        // Por enquanto so logamos pra validar o caminho.
        console.log(`[webhook:evolution] MESSAGES_UPSERT agent=${agentId}`, {
          remoteJid: data?.key?.remoteJid,
          fromMe: data?.key?.fromMe,
          messageType: data?.messageType,
          pushName: data?.pushName,
        })
        break
      }

      default:
        // Outros eventos sao silenciados — habilitamos quando precisar deles
        break
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[webhook:evolution]', error)
    // Retorna 200 mesmo em erro pra evitar retries infinitos do Evolution
    return NextResponse.json({ ok: true })
  }
}

export async function GET() {
  // Alguns providers fazem health-check via GET antes de assinar
  return NextResponse.json({ ok: true, channel: 'evolution_baileys' })
}

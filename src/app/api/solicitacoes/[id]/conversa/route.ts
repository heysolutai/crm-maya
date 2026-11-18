import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { canonicalPhone, phoneVariants } from '@/lib/api/utils'
import { logAction } from '@/lib/services/audit'
import { publishEvent } from '@/lib/realtime'

/**
 * Conversa da solicitacao, dentro da plataforma (o icone do WhatsApp no CRM
 * nunca leva para fora). Ordem:
 *   1. a conversa ja ligada ao card;
 *   2. a conversa do cliente (aberta primeiro, senao a mais recente);
 *   3. o cliente pelo telefone do card e a conversa dele;
 *   4. sem nada: cria o cliente (se preciso) e uma conversa nova, como o
 *      "Nova conversa" de Atendimentos.
 * O card fica ligado a conversa achada, entao o proximo clique ja vai direto.
 */

type Ctx = { params: Promise<{ id: string }> }

async function conversaDoCliente(companyId: string, clientId: string): Promise<string | null> {
  const aberta = await prisma.conversation.findFirst({
    where: { companyId, clientId, status: { not: 'closed' } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  })
  if (aberta) return aberta.id
  const ultima = await prisma.conversation.findFirst({
    where: { companyId, clientId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  })
  return ultima?.id ?? null
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const auth = await authenticate(req)
    const companyId = auth.companyId
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })

    const { id } = await params
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    // IDOR: so solicitacao deste restaurante.
    const card = await prisma.handoffRequest.findFirst({
      where: { id, companyId },
      select: { id: true, conversationId: true, clientId: true, customerName: true, customerPhone: true },
    })
    if (!card) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    // 1. Conversa ja ligada (e deste restaurante).
    if (card.conversationId) {
      const ligada = await prisma.conversation.findFirst({ where: { id: card.conversationId, companyId }, select: { id: true } })
      if (ligada) return NextResponse.json({ conversationId: ligada.id })
    }

    // 2/3. Cliente: o do card (se for deste restaurante) ou o do telefone.
    let clientId: string | null = null
    if (card.clientId) {
      const doCard = await prisma.client.findFirst({ where: { id: card.clientId, companyId }, select: { id: true } })
      clientId = doCard?.id ?? null
    }
    const digitos = (card.customerPhone ?? '').replace(/\D/g, '')
    if (!clientId && digitos.length >= 10) {
      const variantes = phoneVariants(digitos)
      const pelo = await prisma.client.findFirst({
        where: { companyId, OR: [{ phone: { in: variantes } }, { whatsappLid: { in: variantes } }] },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      })
      clientId = pelo?.id ?? null
    }

    let conversationId = clientId ? await conversaDoCliente(companyId, clientId) : null

    // 4. Nada ainda: cria o cliente e a conversa.
    if (!conversationId) {
      if (!clientId) {
        if (digitos.length < 10) {
          return NextResponse.json({ error: 'Esta solicitação não tem telefone para abrir a conversa' }, { status: 400 })
        }
        const novo = await prisma.client.create({
          data: { companyId, phone: canonicalPhone(digitos), firstName: card.customerName?.trim() || 'Cliente', source: 'crm' },
          select: { id: true },
        })
        clientId = novo.id
      }
      try {
        const criada = await prisma.conversation.create({
          data: { companyId, clientId, status: 'active', channel: 'whatsapp', startedAt: new Date() },
          select: { id: true },
        })
        conversationId = criada.id
        await logAction({ companyId, userId: auth.agentId, action: 'CREATE', entity: 'conversation', entityId: criada.id })
        await publishEvent(companyId, { type: 'conversation:update', conversationId: criada.id })
      } catch (e) {
        // Outra aba criou ao mesmo tempo (indice de uma conversa aberta por cliente).
        if ((e as { code?: string })?.code !== 'P2002') throw e
        conversationId = await conversaDoCliente(companyId, clientId)
        if (!conversationId) throw e
      }
    }

    await prisma.handoffRequest.updateMany({ where: { id, companyId }, data: { conversationId, clientId } })
    return NextResponse.json({ conversationId })
  } catch (error) {
    return handleApiError(error, 'Erro ao abrir a conversa da solicitacao')
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { enqueueInboundMessage } from '@/lib/queue'
import { decryptSecret } from '@/lib/ai-tools/secrets'
import {
  assinaturaEspelhoValida,
  mensagemEspelhoSchema,
  statusEspelhoSchema,
  toPipelinePayloadEspelho,
} from '@/lib/channels/espelho'
import { aplicarStatusEspelho, guardarStatusPendente } from '@/lib/channels/espelho-status'

/**
 * Receiver da conexao "Espelho (somente leitura)": o sistema de origem (ex.:
 * Hermes) manda uma copia de cada mensagem e dos status. Contrato em
 * src/lib/channels/espelho.ts.
 *
 * Seguranca: X-Assinatura (HMAC-SHA256 do corpo bruto com a chave da
 * conexao). Sem chave configurada ou sem assinatura, recusa.
 *
 * Responde rapido (so enfileira): o sistema de origem considera entregue com
 * 2xx em ate 10 s e reenvia senao. Payload autentico mas que o CRM nao usa
 * recebe 200 + log, pra nao gerar reenvio a toa.
 */

const idSchema = z.string().uuid()

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    // Bytes exatos: a assinatura e sobre eles (decodificar antes poderia mudar algum byte).
    const corpoBruto = Buffer.from(await req.arrayBuffer())

    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Conexao nao encontrada' }, { status: 404 })
    }
    const inbox = await prisma.inbox.findFirst({
      where: { id, channelType: 'espelho' },
      select: { id: true, companyId: true, instanceName: true, instanceApiKey: true, isActive: true },
    })
    if (!inbox) return NextResponse.json({ error: 'Conexao nao encontrada' }, { status: 404 })

    const chave = inbox.instanceApiKey ? decryptSecret(inbox.instanceApiKey) : ''
    if (!chave) return NextResponse.json({ error: 'Espelho nao configurado' }, { status: 503 })

    const assinatura = req.headers.get('x-assinatura')
    if (!assinatura) return NextResponse.json({ error: 'Assinatura ausente' }, { status: 401 })
    if (!assinaturaEspelhoValida(corpoBruto, assinatura, chave)) {
      return NextResponse.json({ error: 'Assinatura invalida' }, { status: 401 })
    }

    if (!inbox.isActive) return NextResponse.json({ status: 'ignored', reason: 'inbox_inactive' })

    let corpo: unknown
    try {
      corpo = JSON.parse(corpoBruto.toString('utf8'))
    } catch {
      console.warn('[Espelho] corpo nao e JSON', inbox.id)
      return NextResponse.json({ status: 'ignored', reason: 'payload_invalido' })
    }

    const evento = (corpo as { evento?: unknown })?.evento ?? 'mensagem'

    // Status nunca cria contato nem conversa: so atualiza a mensagem pelo id.
    // Se ela ainda esta na fila, o status fica pendente e entra quando ela for gravada.
    if (evento === 'status') {
      const status = statusEspelhoSchema.safeParse(corpo)
      if (!status.success) {
        console.warn('[Espelho] status invalido', inbox.id, status.error.flatten().fieldErrors)
        return NextResponse.json({ status: 'ignored', reason: 'status_invalido' })
      }
      const valor = status.data.status.toLowerCase()
      const atualizadas = await aplicarStatusEspelho(inbox.companyId, status.data.id, valor)
      if (atualizadas === 0) await guardarStatusPendente(inbox.companyId, status.data.id, valor)
      return NextResponse.json({ status: atualizadas ? 'ok' : 'pendente', atualizadas })
    }

    if (evento !== 'mensagem') {
      return NextResponse.json({ status: 'ignored', reason: 'evento_desconhecido' })
    }

    const mensagem = mensagemEspelhoSchema.safeParse(corpo)
    if (!mensagem.success) {
      console.warn('[Espelho] mensagem invalida', inbox.id, mensagem.error.flatten().fieldErrors)
      return NextResponse.json({ status: 'ignored', reason: 'mensagem_invalida' })
    }

    const payload = toPipelinePayloadEspelho(inbox.instanceName, mensagem.data)
    await enqueueInboundMessage({ rawPayload: payload, receivedAt: new Date().toISOString() })
    return NextResponse.json({ status: 'queued' })
  } catch (error) {
    // 500: o sistema de origem reenvia (fila fora do ar, banco indisponivel...).
    console.error('[Espelho] erro ao receber:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

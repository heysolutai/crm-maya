import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { verifyCovercutSignature } from '@/lib/channels/covercut'
import { publicAppBaseUrl, syncCloudNumbers } from '@/lib/channels/cloud-saas'

/**
 * Webhook de servidor das Contas SaaS da Covercut ("Webhook de Notificacao"
 * no painel). Evento saas_customer_connected = um restaurante conectou numero.
 *
 * Cobre o caso em que o dono conecta por um link enviado (outro aparelho) ou
 * fecha o pop-up antes do navegador avisar: a inbox e criada mesmo assim.
 *
 * Assinatura: X-BSP-Signature = HMAC-SHA256 do corpo com COVERCUT_WEBHOOK_SECRET.
 * Sem o secret configurado, recusa (nao ha como validar).
 */

const payloadSchema = z.object({
  event: z.string(),
  data: z
    .object({
      external_id: z.string().uuid().nullable().optional(),
    })
    .passthrough()
    .optional(),
})

export async function POST(req: NextRequest) {
  const secret = process.env.COVERCUT_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Webhook nao configurado' }, { status: 503 })
  }

  const rawBody = await req.text()
  const signature = req.headers.get('x-bsp-signature')
  if (!signature) return NextResponse.json({ error: 'Assinatura ausente' }, { status: 401 })
  if (!verifyCovercutSignature(rawBody, signature, secret)) {
    console.warn('[Covercut SaaS] assinatura invalida')
    return NextResponse.json({ error: 'Assinatura invalida' }, { status: 401 })
  }

  try {
    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Payload invalido' }, { status: 400 })
    }
    const parsed = payloadSchema.safeParse(parsedJson)
    if (!parsed.success) return NextResponse.json({ error: 'Payload invalido' }, { status: 400 })

    if (parsed.data.event !== 'saas_customer_connected') {
      return NextResponse.json({ status: 'ignored', reason: parsed.data.event })
    }

    // external_id e o companyId que o nosso backend mandou no /saas/create.
    const companyId = parsed.data.data?.external_id
    if (!companyId) {
      console.warn('[Covercut SaaS] conexao sem external_id (link criado fora do sistema?)')
      return NextResponse.json({ status: 'ignored', reason: 'sem_external_id' })
    }
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } })
    if (!company) return NextResponse.json({ status: 'ignored', reason: 'empresa_inexistente' })

    const result = await syncCloudNumbers(companyId, publicAppBaseUrl(req))
    console.log(
      `[Covercut SaaS] empresa ${companyId}: ${result.created.length} criada(s), ${result.alreadyLinked} ja vinculada(s), ${result.failed.length} falha(s)`
    )
    return NextResponse.json({ success: true, created: result.created.length })
  } catch (error) {
    console.error('[Covercut SaaS] erro ao processar webhook:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { isCompanyAdmin } from '@/lib/api/company-admin'
import { indexFaq } from '@/lib/ai/faq-indexer'

/**
 * "Adicionar a base de conhecimento": a duvida que a IA nao soube responder
 * vira pergunta e resposta da base (a IA passa a saber) e, se pedido, a
 * solicitacao fica resolvida. So o admin do restaurante (mexe no que a IA diz).
 */

type Ctx = { params: Promise<{ id: string }> }

const schema = z.object({
  pergunta: z.string().trim().min(3, 'Escreva a pergunta').max(500),
  resposta: z.string().trim().min(2, 'Escreva a resposta').max(4000),
  resolver: z.boolean().optional().default(true),
})

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const auth = await authenticate(req)
    const companyId = auth.companyId
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
    if (!(await isCompanyAdmin(auth))) {
      return NextResponse.json({ error: 'Apenas o administrador do restaurante pode mudar a base de conhecimento' }, { status: 403 })
    }

    const { id } = await params
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }
    const { pergunta, resposta, resolver } = parsed.data

    // IDOR: so solicitacao deste restaurante.
    const solicitacao = await prisma.handoffRequest.findFirst({ where: { id, companyId }, select: { id: true, funnel: true } })
    if (!solicitacao) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    const ultima = await prisma.companyFaq.findFirst({
      where: { companyId },
      select: { orderPosition: true },
      orderBy: { orderPosition: 'desc' },
    })
    const faq = await prisma.companyFaq.create({
      data: { companyId, question: pergunta, answer: resposta, isActive: true, orderPosition: (ultima?.orderPosition ?? -1) + 1 },
    })
    // Aguarda a indexacao: a IA ja passa a achar a resposta na proxima mensagem.
    const indexada = await indexFaq(companyId, faq)

    if (resolver && solicitacao.funnel === 'atendimento') {
      const agora = new Date()
      await prisma.handoffRequest.updateMany({
        where: { id, companyId, stage: { not: 'resolvido' } },
        data: { stage: 'resolvido', closedAt: agora },
      })
      await prisma.handoffRequest.updateMany({ where: { id, companyId, firstResponseAt: null }, data: { firstResponseAt: agora } })
    }

    return NextResponse.json({ success: true, faqId: faq.id, indexada }, { status: 201 })
  } catch (error) {
    return handleApiError(error, 'Erro ao adicionar a base de conhecimento')
  }
}

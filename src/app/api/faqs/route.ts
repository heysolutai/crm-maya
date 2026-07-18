import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { indexFaq, unindexFaq } from '@/lib/ai/faq-indexer'

const createFaqSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  keywords: z.array(z.string()).nullable().optional().transform(v => v ?? undefined),
  category: z.string().nullable().optional().transform(v => v ?? undefined),
  orderPosition: z.number().int().optional(),
  isActive: z.boolean().optional(),
})

const deleteManySchema = z.object({
  action: z.literal('deleteMany'),
  ids: z.array(z.string().uuid()),
})

const reorderSchema = z.object({
  action: z.literal('reorder'),
  orderedIds: z.array(z.string().uuid()),
})

const updateFaqSchema = z.object({
  id: z.string().uuid(),
  question: z.string().min(1).optional(),
  answer: z.string().min(1).optional(),
  keywords: z.array(z.string()).nullable().optional().transform(v => v ?? undefined),
  category: z.string().nullable().optional().transform(v => v ?? undefined),
  orderPosition: z.number().int().optional(),
  isActive: z.boolean().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    const faqs = await prisma.companyFaq.findMany({
      where: { companyId },
      orderBy: { orderPosition: 'asc' },
    })
    return NextResponse.json(faqs)
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    const body = await req.json()

    if (body.action === 'deleteMany') {
      const deleteValidation = deleteManySchema.safeParse(body)
      if (!deleteValidation.success) {
        return NextResponse.json(
          { error: 'Dados invalidos', details: deleteValidation.error.flatten().fieldErrors },
          { status: 400 }
        )
      }
      // IDOR: deleta apenas FAQs da empresa autenticada
      await prisma.companyFaq.deleteMany({
        where: { id: { in: deleteValidation.data.ids }, companyId },
      })
      // Tira da base vetorial tambem, senao a IA continuaria achando os FAQs
      for (const faqId of deleteValidation.data.ids) {
        await unindexFaq(companyId, faqId)
      }
      return NextResponse.json({ success: true })
    }

    if (body.action === 'reorder') {
      const reorderValidation = reorderSchema.safeParse(body)
      if (!reorderValidation.success) {
        return NextResponse.json(
          { error: 'Dados invalidos', details: reorderValidation.error.flatten().fieldErrors },
          { status: 400 }
        )
      }
      // IDOR: updateMany com filtro de companyId — nao mexe em FAQs de outras empresas
      for (let i = 0; i < reorderValidation.data.orderedIds.length; i++) {
        await prisma.companyFaq.updateMany({
          where: { id: reorderValidation.data.orderedIds[i], companyId },
          data: { orderPosition: i },
        })
      }
      return NextResponse.json({ success: true })
    }

    const validation = createFaqSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const faq = await prisma.companyFaq.create({
      data: {
        companyId,
        question: validation.data.question,
        answer: validation.data.answer,
        keywords: validation.data.keywords ?? undefined,
        category: validation.data.category ?? undefined,
        orderPosition: validation.data.orderPosition ?? 0,
      },
    })

    // Log de entrada: serve tambem como marcador de versao. Se esta linha nao
    // aparece no log do container, a imagem em execucao NAO tem este codigo.
    console.log(`[FAQ] Criado ${faq.id} — iniciando indexacao vetorial`)

    // Indexa na base vetorial. Nunca lanca — se a OpenAI ou o banco vetorial
    // falharem, o FAQ ja esta salvo e a falha fica no log.
    const indexed = await indexFaq(companyId, faq)
    console.log(`[FAQ] Indexacao de ${faq.id}: ${indexed ? 'OK' : 'PULADA (ver motivo acima)'}`)

    return NextResponse.json(faq, { status: 201 })
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    const body = await req.json()

    const validation = updateFaqSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { id, ...updates } = validation.data

    const existing = await prisma.companyFaq.findFirst({ where: { id, companyId } })
    if (!existing) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    const faq = await prisma.companyFaq.update({ where: { id }, data: updates as any })

    // Reindexa com o conteudo novo. FAQ desativado sai do indice.
    await indexFaq(companyId, faq)

    return NextResponse.json(faq)
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const existing = await prisma.companyFaq.findFirst({ where: { id, companyId } })
    if (!existing) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    await prisma.companyFaq.delete({ where: { id } })

    // Remove tambem da base vetorial.
    await unindexFaq(companyId, id)

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}

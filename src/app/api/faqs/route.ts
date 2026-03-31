import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

const createFaqSchema = z.object({
  companyId: z.string().uuid(),
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
    await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const faqs = await prisma.companyFaq.findMany({
      where: { companyId },
      orderBy: { orderPosition: 'asc' },
    })
    return NextResponse.json(faqs)
  } catch (error) {
    console.error('Erro:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await authenticate(req)
    const body = await req.json()

    if (body.action === 'deleteMany') {
      const deleteValidation = deleteManySchema.safeParse(body)
      if (!deleteValidation.success) {
        return NextResponse.json(
          { error: 'Dados invalidos', details: deleteValidation.error.flatten().fieldErrors },
          { status: 400 }
        )
      }
      await prisma.companyFaq.deleteMany({ where: { id: { in: deleteValidation.data.ids } } })
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
      for (let i = 0; i < reorderValidation.data.orderedIds.length; i++) {
        await prisma.companyFaq.update({
          where: { id: reorderValidation.data.orderedIds[i] },
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
        companyId: validation.data.companyId,
        question: validation.data.question,
        answer: validation.data.answer,
        keywords: validation.data.keywords ?? undefined,
        category: validation.data.category ?? undefined,
        orderPosition: validation.data.orderPosition ?? 0,
      },
    })
    return NextResponse.json(faq, { status: 201 })
  } catch (error) {
    console.error('Erro:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
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
    return NextResponse.json(faq)
  } catch (error) {
    console.error('Erro:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
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
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

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
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await authenticate(req)
    const body = await req.json()

    if (body.action === 'deleteMany') {
      await prisma.companyFaq.deleteMany({ where: { id: { in: body.ids } } })
      return NextResponse.json({ success: true })
    }

    if (body.action === 'reorder') {
      for (let i = 0; i < body.orderedIds.length; i++) {
        await prisma.companyFaq.update({
          where: { id: body.orderedIds[i] },
          data: { orderPosition: i },
        })
      }
      return NextResponse.json({ success: true })
    }

    const faq = await prisma.companyFaq.create({
      data: {
        companyId: body.companyId,
        question: body.question,
        answer: body.answer,
        keywords: body.keywords || null,
        category: body.category || null,
        orderPosition: body.orderPosition ?? 0,
      },
    })
    return NextResponse.json(faq)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await authenticate(req)
    const body = await req.json()
    const { id, ...updates } = body

    const faq = await prisma.companyFaq.update({ where: { id }, data: updates })
    return NextResponse.json(faq)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await authenticate(req)
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    await prisma.companyFaq.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

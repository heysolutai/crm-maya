import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

/**
 * Avaliacoes do cliente sobre o atendimento/experiencia.
 * A IA (via n8n, com x-api-key) cria ao coletar a nota no WhatsApp; o atendente
 * tambem pode registrar manualmente.
 */

/**
 * Deriva o sentimento a partir da nota.
 * Usado quando a IA nao manda 'sentiment' explicito — assim o campo nunca
 * fica vazio nem contradiz a nota por omissao.
 */
function sentimentFromRating(rating: number): 'positivo' | 'neutro' | 'negativo' {
  if (rating >= 4) return 'positivo'
  if (rating <= 2) return 'negativo'
  return 'neutro'
}

const createSchema = z.object({
  rating: z.number().int().min(1).max(5),
  // Opcional: se ausente, derivamos da nota. A IA pode mandar explicito quando
  // o texto contradiz a nota (ex: nota 4 com reclamacao seria 'negativo').
  sentiment: z.enum(['positivo', 'neutro', 'negativo']).optional(),
  comment: z.string().max(2000).optional().nullable(),
  customerName: z.string().max(255).optional().nullable(),
  source: z.enum(['ai', 'agent', 'manual']).optional().default('ai'),
  clientId: z.string().uuid().optional().nullable(),
  conversationId: z.string().uuid().optional().nullable(),
  reservationId: z.string().uuid().optional().nullable(),
})

export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
  }
  const companyId = auth.companyId

  try {
    const { searchParams } = new URL(req.url)
    const page = Math.max(parseInt(searchParams.get('page') || '1'), 1)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20'), 1), 100)
    const rating = searchParams.get('rating')
    const sentiment = searchParams.get('sentiment')
    const search = searchParams.get('search') || ''
    // Periodo da DATA DA RESERVA (nao da avaliacao). Formato YYYY-MM-DD.
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    // Datas interpretadas no fuso de Brasilia (UTC-3, sem horario de verao).
    const reservedForRange = {
      ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00-03:00`) } : {}),
      ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999-03:00`) } : {}),
    }

    const where = {
      companyId,
      ...(rating ? { rating: parseInt(rating) } : {}),
      ...(sentiment ? { sentiment } : {}),
      ...(dateFrom || dateTo
        ? { reservation: { is: { reservedFor: reservedForRange } } }
        : {}),
      ...(search
        ? {
            OR: [
              { customerName: { contains: search, mode: 'insensitive' as const } },
              { comment: { contains: search, mode: 'insensitive' as const } },
              {
                client: {
                  is: {
                    OR: [
                      { fullName: { contains: search, mode: 'insensitive' as const } },
                      { firstName: { contains: search, mode: 'insensitive' as const } },
                      { lastName: { contains: search, mode: 'insensitive' as const } },
                      { phone: { contains: search } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    }

    const [data, total, aggregate, bySentiment] = await Promise.all([
      prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          client: {
            select: { fullName: true, firstName: true, lastName: true, phone: true },
          },
          reservation: {
            select: { reservedFor: true, partySize: true },
          },
        },
      }),
      prisma.review.count({ where }),
      // Media geral da empresa (nao do filtro) — serve de referencia fixa
      prisma.review.aggregate({
        where: { companyId },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      // Quantas positivas/neutras/negativas no total da empresa
      prisma.review.groupBy({
        by: ['sentiment'],
        where: { companyId },
        _count: { _all: true },
      }),
    ])

    return NextResponse.json({
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      summary: {
        average: aggregate._avg.rating
          ? Math.round(aggregate._avg.rating * 10) / 10
          : null,
        total: aggregate._count._all,
        positivo: bySentiment.find((s) => s.sentiment === 'positivo')?._count._all ?? 0,
        neutro: bySentiment.find((s) => s.sentiment === 'neutro')?._count._all ?? 0,
        negativo: bySentiment.find((s) => s.sentiment === 'negativo')?._count._all ?? 0,
      },
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao listar avaliacoes')
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
  }
  const companyId = auth.companyId

  try {
    const body = await req.json()
    const validation = createSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const d = validation.data

    // IDOR: os IDs de referencia precisam pertencer a mesma empresa.
    if (d.clientId) {
      const client = await prisma.client.findFirst({
        where: { id: d.clientId, companyId },
        select: { id: true },
      })
      if (!client) return NextResponse.json({ error: 'Cliente invalido' }, { status: 400 })
    }
    if (d.conversationId) {
      const conv = await prisma.conversation.findFirst({
        where: { id: d.conversationId, companyId },
        select: { id: true },
      })
      if (!conv) return NextResponse.json({ error: 'Conversa invalida' }, { status: 400 })
    }
    if (d.reservationId) {
      const resv = await prisma.reservation.findFirst({
        where: { id: d.reservationId, companyId },
        select: { id: true },
      })
      if (!resv) return NextResponse.json({ error: 'Reserva invalida' }, { status: 400 })
    }

    const review = await prisma.review.create({
      data: {
        companyId,
        rating: d.rating,
        sentiment: d.sentiment ?? sentimentFromRating(d.rating),
        comment: d.comment ?? null,
        customerName: d.customerName ?? null,
        source: d.source,
        clientId: d.clientId ?? null,
        conversationId: d.conversationId ?? null,
        reservationId: d.reservationId ?? null,
      },
    })

    return NextResponse.json(review, { status: 201 })
  } catch (error) {
    return handleApiError(error, 'Erro ao criar avaliacao')
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
  }

  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID obrigatorio' }, { status: 400 })

    // IDOR: so remove se a avaliacao for da empresa autenticada
    const existing = await prisma.review.findFirst({
      where: { id, companyId: auth.companyId },
      select: { id: true },
    })
    if (!existing) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    await prisma.review.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro ao remover avaliacao')
  }
}

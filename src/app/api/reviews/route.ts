import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { phoneVariants } from '@/lib/api/utils'

/**
 * Avaliacoes do cliente sobre o atendimento/experiencia.
 * A IA (via n8n, com x-api-key) cria ao coletar a nota no WhatsApp; o atendente
 * tambem pode registrar manualmente.
 */

/**
 * Deriva o sentimento a partir da nota.
 * Usado quando a IA nao manda 'sentiment' explicito: assim o campo nunca
 * fica vazio nem contradiz a nota por omissao.
 */
function sentimentFromRating(rating: number): 'positivo' | 'neutro' | 'negativo' {
  if (rating >= 4) return 'positivo'
  if (rating <= 2) return 'negativo'
  return 'neutro'
}

/**
 * Sentimento do jeito que a IA manda ("Positiva", "negative", "promotor"...)
 * traduzido pros 3 que a tela mostra. O texto padrao de criterios classifica
 * no estilo NPS (promotor/neutro/detrator). O que nao reconhecer vira
 * ausente e a nota decide: a avaliacao nao se perde por causa do rotulo.
 */
const SENTIMENTOS = new Map<string, 'positivo' | 'neutro' | 'negativo'>([
  ['positivo', 'positivo'], ['positiva', 'positivo'], ['positive', 'positivo'], ['promotor', 'positivo'], ['promoter', 'positivo'],
  ['neutro', 'neutro'], ['neutra', 'neutro'], ['neutral', 'neutro'], ['passivo', 'neutro'], ['passive', 'neutro'],
  ['negativo', 'negativo'], ['negativa', 'negativo'], ['negative', 'negativo'], ['detrator', 'negativo'], ['detractor', 'negativo'],
])
const normalizarSentimento = (v: unknown) => (typeof v === 'string' ? SENTIMENTOS.get(v.trim().toLowerCase()) : undefined)

/** O n8n manda campo opcional nao preenchido como "": conta como nao informado. */
const vazioComoAusente = (v: unknown) => (v === '' || v === null ? undefined : v)

/**
 * A nota e guardada de 1 a 5 (estrelas: media e filtro da tela). Fluxo que
 * pergunta de 0 a 10 (estilo NPS) manda a nota como veio: acima de 5, ou 0,
 * so pode ser da escala de 10; de 1 a 5 vale a de 5, a nao ser que venha
 * `rating_scale: 10`. De 10 pra 5: 9-10 -> 5, 7-8 -> 4, 5-6 -> 3, 3-4 -> 2, 0-2 -> 1.
 */
function notaDeCincoEstrelas(nota: number, escala?: number): number {
  const deDez = escala === 10 || nota > 5 || nota === 0
  return deDez ? Math.min(5, Math.max(1, Math.round(nota / 2))) : Math.round(nota)
}

const createSchema = z.object({
  // coerce: o n8n manda body parameters como string ("5")
  rating: z.coerce.number().min(0).max(10),
  /// 5 (padrao) ou 10: em que escala a nota foi pedida ao cliente.
  rating_scale: z.preprocess(
    vazioComoAusente,
    z.coerce.number().refine((v) => v === 5 || v === 10, 'Use 5 ou 10').optional()
  ).optional(),
  // Opcional: se ausente, derivamos da nota. A IA pode mandar explicito quando
  // o texto contradiz a nota (ex: nota 4 com reclamacao seria 'negativo').
  // .optional() por fora: no zod 4 o preprocess sozinho torna o campo obrigatorio.
  sentiment: z.preprocess(normalizarSentimento, z.enum(['positivo', 'neutro', 'negativo']).optional()).optional(),
  comment: z.string().max(2000).optional().nullable(),
  customerName: z.string().max(255).optional().nullable(),
  source: z.preprocess(vazioComoAusente, z.enum(['ai', 'agent', 'manual']).optional()).optional(),
  /// Telefone do cliente: alternativa simples ao clientId: o CRM resolve o
  /// cliente sozinho (mesmo match com/sem 9 usado no resto do sistema).
  phone: z.string().min(5).max(30).optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
  conversationId: z.string().uuid().optional().nullable(),
  reservationId: z.string().uuid().optional().nullable(),
  /// Codigo da reserva no sistema externo (ex: "F2IE8J9F"): texto livre,
  /// diferente do reservationId (UUID do CRM).
  reservation_code: z.string().max(60).optional().nullable(),
  reservationCode: z.string().max(60).optional().nullable(),
  /// Data da reserva avaliada: "YYYY-MM-DD" (+ reservation_time opcional
  /// "HH:mm") ou ISO completo. Interpretada no fuso de Brasilia.
  reservation_date: z.string().max(40).optional().nullable(),
  reservationDate: z.string().max(40).optional().nullable(),
  reservation_time: z.preprocess(vazioComoAusente, z.string().regex(/^\d{2}:\d{2}$/).optional()).optional(),
}).superRefine((d, ctx) => {
  if (d.rating_scale === 5 && (d.rating < 1 || d.rating > 5)) {
    ctx.addIssue({ code: 'custom', path: ['rating'], message: 'Na escala de 5, a nota vai de 1 a 5' })
  }
})

/** "YYYY-MM-DD" (+ "HH:mm") ou ISO → Date no fuso de Brasilia. Null se invalida. */
function parseReservationDate(dateStr: string, time?: string | null): Date | null {
  const s = dateStr.trim()
  const isoDay = /^\d{4}-\d{2}-\d{2}$/
  const parsed = isoDay.test(s)
    ? new Date(`${s}T${time || '00:00'}:00-03:00`)
    : new Date(s)
  return isNaN(parsed.getTime()) ? null : parsed
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
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
        ? {
            // Data da reserva: vale tanto a reserva vinculada (CRM) quanto a
            // data informada direto pelo fluxo (reservationDate).
            AND: [
              {
                OR: [
                  { reservation: { is: { reservedFor: reservedForRange } } },
                  { reservationDate: reservedForRange },
                ],
              },
            ],
          }
        : {}),
      ...(search
        ? {
            OR: [
              { customerName: { contains: search, mode: 'insensitive' as const } },
              { comment: { contains: search, mode: 'insensitive' as const } },
              { reservationCode: { contains: search, mode: 'insensitive' as const } },
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
      // Media geral do restaurante (nao do filtro): serve de referencia fixa
      prisma.review.aggregate({
        where: { companyId },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      // Quantas positivas/neutras/negativas no total do restaurante
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
    return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
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

    // Data da reserva (string do fluxo → Date BRT)
    const rawReservationDate = d.reservation_date ?? d.reservationDate
    let reservationDate: Date | null = null
    if (rawReservationDate) {
      reservationDate = parseReservationDate(rawReservationDate, d.reservation_time)
      if (!reservationDate) {
        return NextResponse.json(
          { error: 'reservation_date invalida (use YYYY-MM-DD ou ISO)' },
          { status: 400 }
        )
      }
    }

    // Telefone → cliente (quando clientId nao veio). Nao cria cliente novo:
    // se nao achar, a avaliacao fica sem vinculo, sem erro.
    let clientId = d.clientId ?? null
    if (!clientId && d.phone) {
      const variants = phoneVariants(d.phone)
      const client = await prisma.client.findFirst({
        where: {
          companyId,
          OR: [{ phone: { in: variants } }, { whatsappLid: { in: variants } }],
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })
      if (client) clientId = client.id
    }

    // IDOR: os IDs de referencia precisam pertencer a mesmo restaurante.
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

    const rating = notaDeCincoEstrelas(d.rating, d.rating_scale)
    const review = await prisma.review.create({
      data: {
        companyId,
        rating,
        sentiment: d.sentiment ?? sentimentFromRating(rating),
        comment: d.comment ?? null,
        customerName: d.customerName ?? null,
        source: d.source ?? 'ai',
        clientId,
        conversationId: d.conversationId ?? null,
        reservationId: d.reservationId ?? null,
        reservationDate,
        reservationCode: (d.reservation_code ?? d.reservationCode)?.trim() || null,
      },
    })

    // Avaliacao registrada = fluxo encerrado. Qualquer follow-up ainda
    // agendado pra essa conversa morre aqui: o cliente ja respondeu a
    // pesquisa, e cobrar resposta 24h depois e spam. Sem isto, jobs criados
    // ANTES desta correcao continuariam disparando.
    if (d.conversationId) {
      const { count } = await prisma.followUpJob.updateMany({
        where: { conversationId: d.conversationId, companyId, status: 'pending' },
        data: { status: 'cancelled' },
      })
      if (count > 0) {
        console.log(`[Reviews] ${count} follow-up(s) cancelado(s) na conversa ${d.conversationId}`)
      }
    }

    return NextResponse.json(review, { status: 201 })
  } catch (error) {
    return handleApiError(error, 'Erro ao criar avaliacao')
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
  }

  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID obrigatorio' }, { status: 400 })

    // IDOR: so remove se a avaliacao for do restaurante autenticado
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

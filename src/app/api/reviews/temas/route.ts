import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { agrupar, separarComentarios } from '@/lib/reviews/temas'

/**
 * Top 5 elogios e reclamacoes por periodo (dia, semana, mes).
 *
 * A classificacao por tema vive em `@/lib/reviews/temas`, compartilhada com o
 * relatorio semanal por e-mail.
 */

type Periodo = 'dia' | 'semana' | 'mes'

function inicioDoPeriodo(periodo: Periodo): Date {
  const agora = new Date()
  if (periodo === 'dia') {
    // Hoje no fuso de Brasilia (UTC-3, sem horario de verao).
    const hoje = new Date(agora.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
    return new Date(`${hoje}T00:00:00-03:00`)
  }
  const dias = periodo === 'semana' ? 7 : 30
  return new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000)
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
  }

  try {
    const bruto = req.nextUrl.searchParams.get('periodo') || 'semana'
    const periodo: Periodo = bruto === 'dia' || bruto === 'mes' ? bruto : 'semana'
    const desde = inicioDoPeriodo(periodo)

    const avaliacoes = await prisma.review.findMany({
      where: { companyId: auth.companyId, createdAt: { gte: desde } },
      orderBy: { createdAt: 'desc' },
      take: 2000,
      select: { sentiment: true, rating: true, comment: true },
    })

    const { comComentario, elogios, reclamacoes } = separarComentarios(avaliacoes)

    return NextResponse.json({
      periodo,
      desde: desde.toISOString(),
      totalAvaliacoes: avaliacoes.length,
      totalComComentario: comComentario,
      elogios: agrupar(elogios),
      reclamacoes: agrupar(reclamacoes),
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao agrupar temas das avaliacoes')
  }
}

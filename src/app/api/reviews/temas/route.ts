import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

/**
 * Top 5 elogios e reclamacoes por periodo (dia, semana, mes).
 *
 * A avaliacao tem nota, sentimento e comentario livre. "Top 5" e sobre O QUE
 * os clientes mais elogiam e do que mais reclamam, entao o comentario e
 * classificado em temas de restaurante por palavra-chave. E deterministico,
 * nao custa token, e cobre o vocabulario de avaliacao de restaurante; um
 * comentario pode cair em mais de um tema ("comida otima mas demorou").
 */

type Periodo = 'dia' | 'semana' | 'mes'

const TEMAS: Array<{ tema: string; termos: RegExp }> = [
  { tema: 'Atendimento', termos: /atend|gar[cç]o|equipe|staff|educad|simp[aá]tic|gentil|grosseir|atencios|cordial|ignor|mal[- ]?humor/i },
  { tema: 'Comida e sabor', termos: /comida|prato|sabor|gostos|delici|saboros|temper|cru[ao]?\b|queimad|salgad|sem gosto|massa|pizza|carne|peixe|sobremesa|entrada|hamb[uú]rguer|sushi|feijoada|risoto|fresc/i },
  { tema: 'Tempo de espera', termos: /demor|esper|lent[oa]|r[aá]pid|[aá]gil|atras|tempo/i },
  { tema: 'Preço', termos: /pre[cç]|caro|barat|valor|custo|conta\b|cobr|em conta/i },
  { tema: 'Ambiente', termos: /ambiente|lugar|espa[cç]o|decor|m[uú]sica|barulh|clima|aconcheg|vista|mesa\b|cadeira|ar[- ]condicionado|calor|ilumina|confort/i },
  { tema: 'Limpeza', termos: /limp|suj|higien|banheiro|cheiro|mofo/i },
  { tema: 'Reserva e organização', termos: /reserva|agend|hor[aá]rio|lotad|fila|organiz|confus|bagun/i },
  { tema: 'Bebidas', termos: /bebida|drink|vinho|cerveja|suco|caf[eé]|chopp|coquetel|caipir|refrigerante|[aá]gua\b/i },
  { tema: 'Porção e quantidade', termos: /por[cç][aã]o|quantidade|pouc[oa]|pequen|generos|fart|serve bem/i },
  { tema: 'Entrega e pedido', termos: /entrega|delivery|pedido|errad|troc|faltou|esquec|embalag/i },
]

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

interface Tema {
  tema: string
  total: number
  exemplos: string[]
}

function classificar(comentario: string): string[] {
  const temas = TEMAS.filter((t) => t.termos.test(comentario)).map((t) => t.tema)
  return temas.length ? temas : ['Outros']
}

function agrupar(comentarios: string[]): Tema[] {
  const mapa = new Map<string, Tema>()
  for (const c of comentarios) {
    for (const tema of classificar(c)) {
      const atual = mapa.get(tema) || { tema, total: 0, exemplos: [] }
      atual.total++
      if (atual.exemplos.length < 2) atual.exemplos.push(c.length > 140 ? `${c.slice(0, 137)}...` : c)
      mapa.set(tema, atual)
    }
  }
  return Array.from(mapa.values())
    .sort((a, b) => b.total - a.total || a.tema.localeCompare(b.tema))
    .slice(0, 5)
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

    const comComentario = avaliacoes.filter((a) => (a.comment || '').trim().length > 0)
    // Sentimento manda; nota desempata quando veio "neutro" com texto claro.
    const elogios = comComentario
      .filter((a) => a.sentiment === 'positivo' || (a.sentiment === 'neutro' && a.rating >= 4))
      .map((a) => a.comment!.trim())
    const reclamacoes = comComentario
      .filter((a) => a.sentiment === 'negativo' || (a.sentiment === 'neutro' && a.rating <= 2))
      .map((a) => a.comment!.trim())

    return NextResponse.json({
      periodo,
      desde: desde.toISOString(),
      totalAvaliacoes: avaliacoes.length,
      totalComComentario: comComentario.length,
      elogios: agrupar(elogios),
      reclamacoes: agrupar(reclamacoes),
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao agrupar temas das avaliacoes')
  }
}

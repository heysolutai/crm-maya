/**
 * Classificacao dos comentarios de avaliacao em temas de restaurante.
 *
 * A avaliacao tem nota, sentimento e comentario livre. "Top 5" e sobre O QUE
 * os clientes mais elogiam e do que mais reclamam, entao o comentario e
 * classificado por palavra-chave. E deterministico, nao custa token, e cobre o
 * vocabulario de avaliacao de restaurante; um comentario pode cair em mais de
 * um tema ("comida otima mas demorou").
 *
 * Mora aqui, e nao na rota, porque a tela de avaliacoes e o relatorio semanal
 * por e-mail precisam agrupar exatamente do mesmo jeito.
 */

export const TEMAS: Array<{ tema: string; termos: RegExp }> = [
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

export interface Tema {
  tema: string
  total: number
  exemplos: string[]
}

export function classificar(comentario: string): string[] {
  const temas = TEMAS.filter((t) => t.termos.test(comentario)).map((t) => t.tema)
  return temas.length ? temas : ['Outros']
}

/** Top 5 temas, do mais citado pro menos, com ate 2 comentarios de exemplo. */
export function agrupar(comentarios: string[]): Tema[] {
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

export interface AvaliacaoParaTema {
  sentiment: string
  rating: number
  comment: string | null
}

/**
 * Separa os comentarios entre elogio e reclamacao.
 *
 * O sentimento manda; a nota so desempata quando veio "neutro" com texto
 * claramente de um lado.
 */
export function separarComentarios(avaliacoes: AvaliacaoParaTema[]): {
  comComentario: number
  elogios: string[]
  reclamacoes: string[]
} {
  const comComentario = avaliacoes.filter((a) => (a.comment || '').trim().length > 0)

  return {
    comComentario: comComentario.length,
    elogios: comComentario
      .filter((a) => a.sentiment === 'positivo' || (a.sentiment === 'neutro' && a.rating >= 4))
      .map((a) => a.comment!.trim()),
    reclamacoes: comComentario
      .filter((a) => a.sentiment === 'negativo' || (a.sentiment === 'neutro' && a.rating <= 2))
      .map((a) => a.comment!.trim()),
  }
}

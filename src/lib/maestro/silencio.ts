/**
 * Quando a IA pode ficar quieta de proposito.
 *
 * Caso unico: a conversa ja terminou, a IA ja se despediu e o cliente manda
 * so mais um emoji (👍, ❤️). Responder de novo vira um "disponha" atras do
 * outro. As regras do prompt mandam a IA escrever SEM_RESPOSTA nesse caso.
 *
 * Quem decide se o silencio vale e o sistema, nao o modelo: so quando a
 * mensagem do cliente nao tem nenhuma letra nem numero. Se o modelo usar o
 * marcador numa mensagem com palavras (uma pergunta), o silencio e recusado e
 * o turno segue o caminho de sempre de "sem resposta" (passa pra equipe):
 * cliente com pergunta nunca fica sem retorno.
 */

export const SEM_RESPOSTA = '[SEM_RESPOSTA]'

/** Mensagem so de emoji/pontuacao (nenhuma letra, nenhum numero). */
export function soEmoji(texto: string): boolean {
  const t = texto.trim()
  return t.length > 0 && !/[\p{L}\p{N}]/u.test(t)
}

export interface LeituraDoSilencio {
  /** true = nao enviar nada: o cliente so mandou emoji e a IA escolheu ficar quieta. */
  silencio: boolean
  /** Texto a enviar (sem o marcador). Vazio quando nao sobra nada. */
  texto: string
}

/**
 * Le a resposta do modelo. Sem o marcador: texto como veio. Com o marcador e
 * mais texto: manda o texto (o marcador sai). So o marcador: silencio se o
 * cliente mandou so emoji; senao texto vazio (o chamador trata como sem
 * resposta, igual a hoje).
 */
export function lerSilencio(textoDoModelo: string, textoDoCliente: string): LeituraDoSilencio {
  if (!textoDoModelo.includes(SEM_RESPOSTA)) return { silencio: false, texto: textoDoModelo }
  const resto = textoDoModelo.split(SEM_RESPOSTA).join('').trim()
  if (resto) return { silencio: false, texto: resto }
  return { silencio: soEmoji(textoDoCliente), texto: '' }
}

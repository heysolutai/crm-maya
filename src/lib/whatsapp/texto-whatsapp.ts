/**
 * Texto entre o CRM e o WhatsApp, nas duas direcoes.
 *
 * Saida (IA/n8n/atendente -> WhatsApp): o que vem da IA chega em markdown
 * (**negrito**, ## titulo, [link](url)) e muitas vezes com "\n" literal (barra
 * e n, dois caracteres) porque passou por JSON duas vezes. O WhatsApp nao
 * entende nada disso: o cliente via asteriscos duplos e a barra na tela.
 *
 * Entrada (banco -> tela): o WhatsApp usa *negrito*, _italico_, ~riscado~,
 * `mono` e ```bloco```. A tela mostrava os marcadores crus.
 */

export type TipoInline = 'negrito' | 'italico' | 'riscado' | 'mono'

export type Trecho =
  | { tipo: 'texto'; valor: string }
  | { tipo: 'bloco'; valor: string }
  | { tipo: TipoInline; filhos: Trecho[] }

const MARCADORES: Record<string, TipoInline> = {
  '*': 'negrito',
  _: 'italico',
  '~': 'riscado',
  '`': 'mono',
}

/** "\n" literal vira quebra real; CRLF vira LF; "\t" literal vira dois espacos. */
export function desescaparQuebras(texto: string): string {
  return texto
    .replace(/\r\n?/g, '\n')
    // "\\n" (escapado duas vezes) antes de "\n", senao sobra uma barra.
    .replace(/\\\\n/g, '\n')
    .replace(/\\r\\n|\\n/g, '\n')
    .replace(/\\t/g, '  ')
}

/**
 * Markdown da IA -> marcacao do WhatsApp.
 *
 * So mexe no que e inequivocamente markdown: marcador duplo, titulo com "#",
 * link [texto](url) e item de lista "* item". Um *x* ou _x_ simples ja e
 * WhatsApp valido e fica como esta.
 */
export function markdownParaWhatsApp(texto: string): string {
  let t = desescaparQuebras(texto)
  // "## Titulo" vira linha em negrito.
  t = t.replace(/^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm, '*$1*')
  // **x** e __x__ -> *x*
  t = t.replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, '*$1*')
  t = t.replace(/__(?=\S)([^\n]*?\S)__/g, '*$1*')
  // ~~x~~ -> ~x~
  t = t.replace(/~~(?=\S)([^\n]*?\S)~~/g, '~$1~')
  // [texto](url) -> texto (url)
  t = t.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
  // "* item" -> "- item": asterisco solto no inicio da linha vira negrito
  // acidental quando outra linha tambem tem asterisco.
  t = t.replace(/^([ \t]*)\*[ \t]+(?=\S)/gm, '$1- ')
  return t
}

/** Ponto unico por onde texto de saida passa antes de ir pro provedor. */
/**
 * Travessao nao faz parte do tom de voz do restaurante (pedido do cliente):
 * no meio da frase vira virgula, colado vira hifen, no inicio da linha vira
 * marcador de lista.
 */
export function removerTravessoes(texto: string): string {
  return texto
    .replace(/^[ 	]*[—–][ 	]*/gm, "- ")
    .replace(/[ 	]+[—–][ 	]+/g, ", ")
    .replace(/[—–]/g, "-")
}

export function prepararTextoParaWhatsApp(texto: string): string {
  if (!texto) return texto
  return removerTravessoes(markdownParaWhatsApp(texto))
}

/**
 * Versao de uma linha, sem marcadores, pra previa (lista de conversas,
 * mensagem citada). Sem isto a previa mostrava "\n" e asteriscos.
 */
export function textoPlano(texto: string): string {
  return tokenizarWhatsApp(texto)
    .map(function extrair(t): string {
      return t.tipo === 'texto' || t.tipo === 'bloco' ? t.valor : t.filhos.map(extrair).join('')
    })
    .join('')
    .replace(/\s*\n+\s*/g, ' ')
    .trim()
}

const ehAlfanumerico = (c: string | undefined): boolean => !!c && /[\p{L}\p{N}]/u.test(c)
const ehEspaco = (c: string | undefined): boolean => !!c && /\s/.test(c)

/**
 * Regra do WhatsApp: o marcador abre se nao vem colado em letra/numero antes
 * e tem conteudo (nao espaco, nao outro marcador igual) logo depois.
 * Assim "2 * 3", "snake_case" e "a*b*c" continuam texto.
 */
function podeAbrir(texto: string, i: number): boolean {
  const c = texto[i]
  const prox = texto[i + 1]
  if (!prox || ehEspaco(prox) || prox === c) return false
  return !ehAlfanumerico(texto[i - 1])
}

/** Fechamento: mesmo marcador, colado em conteudo antes, sem letra depois, na mesma linha. */
function acharFechamento(texto: string, i: number): number {
  const c = texto[i]
  for (let j = i + 2; j < texto.length; j++) {
    const ch = texto[j]
    if (ch === '\n') return -1
    if (ch !== c) continue
    if (ehEspaco(texto[j - 1])) continue
    if (ehAlfanumerico(texto[j + 1])) continue
    return j
  }
  return -1
}

function parseInline(texto: string): Trecho[] {
  const saida: Trecho[] = []
  let buf = ''
  let i = 0
  while (i < texto.length) {
    const c = texto[i]
    const tipo = MARCADORES[c]
    if (tipo && podeAbrir(texto, i)) {
      const j = acharFechamento(texto, i)
      if (j > 0) {
        if (buf) {
          saida.push({ tipo: 'texto', valor: buf })
          buf = ''
        }
        const interno = texto.slice(i + 1, j)
        saida.push(
          tipo === 'mono'
            ? { tipo, filhos: [{ tipo: 'texto', valor: interno }] }
            : { tipo, filhos: parseInline(interno) }
        )
        i = j + 1
        continue
      }
    }
    buf += c
    i++
  }
  if (buf) saida.push({ tipo: 'texto', valor: buf })
  return saida
}

/**
 * Quebra o texto de uma mensagem em trechos formatados.
 *
 * Passa pelo markdownParaWhatsApp antes porque mensagem antiga da IA ja esta
 * gravada com **negrito** e "\n" literal; assim a tela corrige o historico
 * sem precisar migrar banco.
 */
export function tokenizarWhatsApp(texto: string): Trecho[] {
  const t = markdownParaWhatsApp(texto)
  const partes: Trecho[] = []
  const bloco = /```([\s\S]+?)```/g
  let ultimo = 0
  let m: RegExpExecArray | null
  while ((m = bloco.exec(t))) {
    if (m.index > ultimo) partes.push(...parseInline(t.slice(ultimo, m.index)))
    partes.push({ tipo: 'bloco', valor: m[1] })
    ultimo = m.index + m[0].length
  }
  if (ultimo < t.length) partes.push(...parseInline(t.slice(ultimo)))
  return partes
}

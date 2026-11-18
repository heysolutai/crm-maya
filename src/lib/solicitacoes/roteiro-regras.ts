import { mensagemPedindoDados } from './perguntas'

/**
 * Trecho do roteiro da IA (src/lib/ai-tools/roteiro.ts) com as regras de
 * encaminhamento do restaurante. Cada regra vira um bloco com QUANDO USAR,
 * QUANDO NAO USAR e os PASSOS em ordem. Os dados sao pedidos sempre numa
 * mensagem so, com a lista numerada (mais estavel que perguntar um por um).
 * Funcao pura: o Maestro, o "Testar a IA" e o n8n recebem o mesmo texto.
 *
 * O que mais importa aqui e nao alucinar: a IA so registra o que o cliente
 * disse nesta conversa; o que faltar, ela pergunta.
 */

export interface RegraNoRoteiro {
  key: string
  name: string
  trigger: string
  notWhen: string
  examples: string[]
  collectFields: string[]
  askMessage: string
  flowMode: string
  introImages: string[]
}

const SEM_INVENTAR =
  'Nunca preencha um dado que o cliente não disse nesta conversa (data, número de pessoas, valor, nome): se faltar, pergunte. No resumo e nos dados, use só o que ele falou.'

function exemplos(r: RegraNoRoteiro): string | null {
  const ex = r.examples.filter((e) => e.trim()).slice(0, 4)
  return ex.length ? `    Frases típicas: "${ex.join('", "')}".` : null
}

/** Pedido dos dados: uma mensagem com a lista; depois, só o que faltar. */
function perguntas(r: RegraNoRoteiro, passo: number): string | null {
  if (!r.collectFields.length) return null
  const pedido = mensagemPedindoDados(r.collectFields, r.askMessage)
    .split('\n')
    .map((l) => `       ${l}`)
    .join('\n')
  return [
    `    ${passo}. Peça os dados numa ÚNICA mensagem, exatamente com este texto (tire da lista o que o cliente já disse e renumere):`,
    '       """',
    pedido,
    '       """',
    '       Se ele responder só uma parte, peça numa mensagem curta apenas o que faltou. Não pergunte um por um.',
  ].join('\n')
}

function blocoDaRegra(r: RegraNoRoteiro, ferramenta: 'transferir_para_humano' | 'encaminhar_para_eventos'): string[] {
  const linhas = [`  - ${r.name} (categoria "${r.key}")`, `    QUANDO USAR: ${r.trigger.trim()}`]
  if (r.notWhen.trim()) linhas.push(`    NÃO USE QUANDO: ${r.notWhen.trim()}`)
  const ex = exemplos(r)
  if (ex) linhas.push(ex)

  let passo = 1
  linhas.push('    Passos:')
  if (ferramenta === 'encaminhar_para_eventos' && r.flowMode === 'apresentar') {
    linhas.push(
      `    ${passo++}. Chame apresentar_evento_personalizado com categoria "${r.key}". A apresentação${r.introImages.length ? ' e as fotos são enviadas' : ' volta no resultado: envie-a ao cliente exatamente como veio'}. Não escreva sua própria apresentação.`
    )
  }
  const p = perguntas(r, passo)
  if (p) {
    linhas.push(p)
    passo++
  }
  linhas.push(
    p
      ? `    ${passo}. Com as respostas, chame ${ferramenta} com categoria "${r.key}", um resumo curto com as palavras do cliente e os dados que ele informou. Depois, responda como a ferramenta indicar.`
      : `    ${passo}. Chame ${ferramenta} com categoria "${r.key}" e um resumo curto do pedido, com as palavras do cliente. Depois, responda como a ferramenta indicar.`
  )
  return linhas
}

export function roteiroAtendimento(regras: RegraNoRoteiro[]): string[] {
  return [
    '- Passe o cliente para a equipe (transferir_para_humano) só numa destas situações; leia o QUANDO USAR e o NÃO USE QUANDO de cada uma:',
    ...regras.flatMap((r) => blocoDaRegra(r, 'transferir_para_humano')),
    `- ${SEM_INVENTAR}`,
    '- Em "motivo", escreva em uma frase o que o cliente pediu ou perguntou; em "dados", o que ele informou (ex.: "Código: 1234").',
    '- Se a ferramenta disser para não responder mais, não responda.',
  ]
}

export function roteiroEventos(regras: RegraNoRoteiro[]): string[] {
  return [
    '- Evento personalizado não é reserva: não use as ferramentas de reserva para ele. Use encaminhar_para_eventos numa destas situações; leia o QUANDO USAR e o NÃO USE QUANDO de cada uma:',
    ...regras.flatMap((r) => blocoDaRegra(r, 'encaminhar_para_eventos')),
    '- Se uma ferramenta de reserva disser que o pedido foge da regra ou deve ir para a equipe de eventos, siga os passos da regra que combina, com origem "sistema_de_reservas".',
    `- ${SEM_INVENTAR}`,
  ]
}

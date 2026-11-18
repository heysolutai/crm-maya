/**
 * Pedido de dados que a IA faz antes de encaminhar (sempre numa mensagem só,
 * com a lista numerada) e a conversa de exemplo da prévia. Arquivo puro: a
 * tela (prévia) e o roteiro da IA usam o mesmo, então o que a prévia mostra é
 * o que a IA foi instruída a fazer.
 */

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

interface Conhecido {
  /** Pedaços do nome do dado que identificam o tipo. */
  chaves: string[]
  /** Resposta de exemplo do cliente (prévia). */
  resposta: string
  /** Como a resposta entra no resumo ("30 pessoas"). */
  noResumo: string
}

const CONHECIDOS: Conhecido[] = [
  { chaves: ['tipo de evento', 'tipo do evento'], resposta: 'Aniversário de 30 anos', noResumo: 'aniversário de 30 anos' },
  { chaves: ['numero de pessoas', 'pessoas', 'convidados', 'quantidade'], resposta: 'Umas 40 pessoas', noResumo: '40 pessoas' },
  { chaves: ['orcamento', 'valor'], resposta: 'Uns R$ 4 mil', noResumo: 'orçamento de uns R$ 4 mil' },
  { chaves: ['cardapio'], resposta: 'Rodízio de massas', noResumo: 'cardápio: rodízio de massas' },
  { chaves: ['horario', 'hora'], resposta: 'Às 20h', noResumo: 'às 20h' },
  { chaves: ['data da reserva', 'codigo'], resposta: 'Era para sábado, código 4821', noResumo: 'reserva de sábado, código 4821' },
  { chaves: ['data'], resposta: 'Dia 14/12', noResumo: 'dia 14/12' },
  { chaves: ['o que aconteceu', 'aconteceu'], resposta: 'A pizza chegou fria', noResumo: 'a pizza chegou fria' },
  { chaves: ['assunto'], resposta: 'Sou fornecedor de bebidas', noResumo: 'fornecedor de bebidas' },
  { chaves: ['email', 'e-mail'], resposta: 'ana@email.com', noResumo: 'e-mail ana@email.com' },
  { chaves: ['nome'], resposta: 'Ana Souza', noResumo: 'Ana Souza' },
]

function conhecido(campo: string): Conhecido | null {
  const n = normalizar(campo)
  return CONHECIDOS.find((c) => c.chaves.some((k) => n.includes(k))) ?? null
}

/** Frase que abre o pedido de dados quando o restaurante não escreveu a sua. */
export const PEDIDO_PADRAO = 'Para eu passar para a nossa equipe, me manda por favor:'

/** A frase + a lista numerada dos dados, numa mensagem só (o cliente responde tudo junto). */
export function mensagemPedindoDados(campos: string[], frase: string): string {
  const lista = campos.map((c, i) => `${i + 1}. ${c}`).join('\n')
  return `${(frase || '').trim() || PEDIDO_PADRAO}\n\n${lista}`
}

/** Resposta do cliente de exemplo, tudo numa mensagem ("Aniversário de 30 anos, dia 14/12, ..."). */
export function respostaJuntaDoExemplo(campos: string[]): string {
  const partes = campos.map((c) => conhecido(c)?.resposta ?? 'resposta do cliente')
  return partes.map((p, i) => (i === 0 ? p : p.charAt(0).toLowerCase() + p.slice(1))).join(', ')
}

/** Resumo montado SÓ com o que o cliente respondeu no exemplo (nada inventado). */
export function resumoDoExemplo(campos: string[], fraseInicial: string): string {
  const partes = campos.map((c) => conhecido(c)?.noResumo ?? `${c.trim().toLowerCase()} informado`)
  if (partes.length) return partes.join(', ')
  // Sem perguntas: o resumo é o próprio pedido do cliente.
  return fraseInicial.replace(/[.!?]+$/, '').replace(/^(oi|olá|ola|bom dia|boa tarde|boa noite)[!,.\s]*/i, '').trim().toLowerCase()
}

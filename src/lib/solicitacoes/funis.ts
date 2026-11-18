/**
 * Funis das Solicitacoes e suas etapas. Arquivo puro (sem banco): a tela e o
 * servidor usam o mesmo. As chaves ficam gravadas em handoff_requests.stage,
 * entao nao mude uma existente (so o rotulo).
 */

export type Funil = 'eventos' | 'atendimento'

export const FUNIS_VALIDOS: Funil[] = ['eventos', 'atendimento']

export interface Etapa {
  key: string
  label: string
  /** Etapa final: a solicitacao saiu do funil (fechada, perdida ou resolvida). */
  final?: boolean
  /** Final positiva (evento fechado / atendimento resolvido). */
  ganho?: boolean
}

export interface DefinicaoFunil {
  label: string
  /** Frase curta embaixo do titulo. */
  descricao: string
  etapas: Etapa[]
  /** Etapa de entrada (onde a IA cria). */
  inicial: string
  /** Para onde vai quando a equipe responde a conversa pela primeira vez. */
  aoAtender: string
}

export const FUNIS: Record<Funil, DefinicaoFunil> = {
  eventos: {
    label: 'Eventos personalizados',
    descricao: 'Pedidos que fogem da reserva normal: aniversário com cardápio fechado, corporativo, palestra, casamento, grupos maiores.',
    etapas: [
      { key: 'novo', label: 'Novo' },
      { key: 'em_contato', label: 'Em contato' },
      { key: 'proposta', label: 'Proposta enviada' },
      { key: 'fechado', label: 'Fechado', final: true, ganho: true },
      { key: 'perdido', label: 'Perdido', final: true },
    ],
    inicial: 'novo',
    aoAtender: 'em_contato',
  },
  atendimento: {
    label: 'Atendimento humano',
    descricao: 'O que a IA passou para a equipe: dúvidas sem resposta, reclamações e outros assuntos.',
    etapas: [
      { key: 'aguardando', label: 'Aguardando' },
      { key: 'em_atendimento', label: 'Em atendimento' },
      { key: 'resolvido', label: 'Resolvido', final: true, ganho: true },
    ],
    inicial: 'aguardando',
    aoAtender: 'em_atendimento',
  },
}

export function ehFunil(v: unknown): v is Funil {
  return v === 'eventos' || v === 'atendimento'
}

export function etapaDe(funil: Funil, key: string): Etapa | undefined {
  return FUNIS[funil].etapas.find((e) => e.key === key)
}

export function etapasAbertas(funil: Funil): string[] {
  return FUNIS[funil].etapas.filter((e) => !e.final).map((e) => e.key)
}

/** Origem da solicitacao, para mostrar no card. */
export const ORIGENS: Record<string, string> = {
  ia: 'IA',
  sistema_reservas: 'Sistema de reservas',
  sistema: 'Automático',
  atendente: 'Equipe',
}

function dataBR(v: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : v
}

/** "Data: 12/12/2026 · Número de pessoas: 30" */
export function dadosEmTexto(dados: Record<string, string | number>): string {
  return Object.entries(dados)
    .filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? dataBR(v) : v}`)
    .join(' · ')
}

/** Variaveis que a resposta ao cliente aceita. */
export const VARIAVEIS_RESPOSTA = [
  { chave: '{nome}', descricao: 'Primeiro nome do cliente' },
  { chave: '{resumo}', descricao: 'Resumo do pedido' },
  { chave: '{restaurante}', descricao: 'Nome do restaurante' },
] as const

/** Troca as variaveis da resposta. Variavel sem valor some sem deixar buraco. */
export function preencherResposta(modelo: string, vars: { nome?: string | null; resumo?: string | null; restaurante?: string | null }): string {
  return modelo
    .replace(/\{nome\}/g, vars.nome?.trim() || '')
    .replace(/\{resumo\}/g, vars.resumo?.trim() || '')
    .replace(/\{restaurante\}/g, vars.restaurante?.trim() || '')
    .replace(/,\s*!/g, '!')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Valor em reais escrito pelo cliente -> numero. "R$ 3.500,00" -> 3500,
 * "3 mil" -> 3000, "3,5 mil" -> 3500, "entre 2 e 3 mil" -> 3000 (o maior).
 * null se nao der para entender.
 */
export function valorEmReais(texto: string | null | undefined): number | null {
  if (!texto) return null
  const t = texto.toLowerCase().replace(/r\$\s*/g, '')
  const mil = /\bmil\b|\bk\b/.test(t)
  const numeros = t.match(/\d+(?:[.\s]\d{3})*(?:,\d+)?|\d+(?:\.\d+)?/g)
  if (!numeros) return null
  const valores = numeros
    .map((n) => {
      // 3.500,00 -> 3500.00 | 3,5 -> 3.5 | 3.5 (decimal com ponto, sem milhar) fica
      const limpo = /,\d+$/.test(n) ? n.replace(/[.\s]/g, '').replace(',', '.') : /^\d{1,3}([.\s]\d{3})+$/.test(n) ? n.replace(/[.\s]/g, '') : n
      const v = Number(limpo)
      return Number.isFinite(v) ? (mil ? v * 1000 : v) : NaN
    })
    .filter((v) => Number.isFinite(v) && v > 0)
  if (!valores.length) return null
  const maior = Math.max(...valores)
  return maior <= 100_000_000 ? Math.round(maior * 100) / 100 : null
}

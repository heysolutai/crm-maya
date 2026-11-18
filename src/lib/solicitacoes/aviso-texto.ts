import type { Funil } from './funis'

/**
 * Texto do aviso da equipe. Arquivo puro: o servidor envia com estas funções e
 * a tela mostra a prévia com as mesmas, então a prévia é exatamente o que chega.
 *
 * Formato: blocos curtos separados por linha em branco e um dado por linha,
 * para ler de relance no celular.
 */

export interface ConteudoAviso {
  funil: Funil
  categoria: string
  clienteNome: string
  clienteTelefone: string
  resumo: string
  /** Dados que o cliente informou, na ordem: ["Data", "12/12/2026"]. */
  dados: [string, string][]
  link: string
}

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/** Ícone de cada dado, para achar rápido na mensagem. */
function iconeDoDado(campo: string): string {
  const n = normalizar(campo)
  if (n.includes('tipo')) return '🎉'
  if (n.includes('pessoas') || n.includes('convidados')) return '👥'
  if (n.includes('orcamento') || n.includes('valor')) return '💰'
  if (n.includes('cardapio')) return '🍽️'
  if (n.includes('horario') || n.includes('hora')) return '🕗'
  if (n.includes('data')) return '📅'
  return '▪️'
}

/** Texto livre (UAZAPI e afins). *negrito* é o negrito do WhatsApp. */
export function textoDoAviso(a: ConteudoAviso): string {
  const blocos: string[] = []
  blocos.push(`🔔 *Nova solicitação no CRM*\n${a.categoria}`)
  blocos.push([`👤 ${a.clienteNome || 'Cliente'}`, a.clienteTelefone ? `📞 ${a.clienteTelefone}` : null].filter(Boolean).join('\n'))
  if (a.resumo.trim()) blocos.push(`📝 ${a.resumo.trim()}`)
  if (a.dados.length) blocos.push(a.dados.map(([k, v]) => `${iconeDoDado(k)} ${k}: ${v}`).join('\n'))
  blocos.push(`👉 Abrir no CRM:\n${a.link}`)
  return blocos.join('\n\n')
}

/** Texto sugerido para aprovar o template na Meta (categoria Utilidade). */
export const TEMPLATE_SUGERIDO = '🔔 *Nova solicitação no CRM*\n{{1}}\n\n👤 {{2}}\n\n📝 {{3}}\n\n👉 Abrir no CRM: {{4}}'

/** As 4 variáveis do template da API oficial, na ordem (a Meta não aceita quebra de linha dentro da variável). */
export function variaveisDoTemplate(a: ConteudoAviso): string[] {
  const cliente = [a.clienteNome || 'Cliente', a.clienteTelefone].filter(Boolean).join(' · ')
  const pedido = [a.resumo.trim(), ...a.dados.map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join(' · ') || '-'
  return [a.categoria, cliente, pedido, a.link]
}

/** Como o template aprovado chega, com as variáveis preenchidas. */
export function textoDoTemplate(a: ConteudoAviso): string {
  const vars = variaveisDoTemplate(a).map((v) => v.replace(/[\r\n\t]+/g, ' · '))
  return TEMPLATE_SUGERIDO.replace(/\{\{(\d)\}\}/g, (_, n: string) => vars[Number(n) - 1] ?? '')
}

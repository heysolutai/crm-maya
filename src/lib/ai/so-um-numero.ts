import { chaveTelefone } from '@/lib/mcp-crm/telefone.mjs'
import { MOTIVOS } from './motivos'

/**
 * "IA ligada para todos" ou "so para alguns numeros" (AiAgent.onlyPhone): com
 * numeros preenchidos a IA responde so esses clientes; os outros ficam com a
 * equipe, como se a IA estivesse desligada. Regra UNICA para os webhooks, o
 * Maestro e o follow-up.
 *
 * O campo guarda os numeros separados por virgula ("41998679696,62999197953"):
 * sem coluna nova nem migracao. Uma versao antiga (que comparava o campo
 * inteiro como UM numero) nao reconhece ninguem numa lista: a IA fica quieta e
 * a equipe atende. Nunca passa a responder todos sem querer.
 */

export interface AgenteLigado {
  isActive: boolean
  onlyPhone?: string | null
}

/** Quantos numeros de teste cabem na lista. */
export const MAX_NUMEROS_TESTE = 20

/** Mesmo numero? Com ou sem 55 e com ou sem o nono digito. */
export function mesmoTelefone(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = chaveTelefone(a)
  return ka.length >= 8 && ka === chaveTelefone(b)
}

/**
 * Numeros do modo teste, so digitos. Vazio = IA para todos. Separa por virgula,
 * ponto e virgula ou quebra de linha (espaco nao: "(41) 99867-9696" e um numero so).
 */
export function numerosDoTeste(onlyPhone: string | null | undefined): string[] {
  if (!onlyPhone) return []
  return onlyPhone
    .split(/[,;\n]+/)
    .map((n) => n.replace(/\D/g, ''))
    .filter((n) => n.length > 0)
}

/** Lista pronta pra gravar: so digitos, sem repetidos (55 e nono digito contam como o mesmo). */
export function juntarNumerosTeste(numeros: string[]): string {
  const unicos: string[] = []
  for (const n of numeros) {
    const d = n.replace(/\D/g, '')
    if (d && !unicos.some((u) => mesmoTelefone(u, d))) unicos.push(d)
  }
  return unicos.join(',')
}

/** Por que a IA NAO atende este cliente (null = atende). */
export function motivoIaNaoAtende(agente: AgenteLigado, telefoneCliente: string | null | undefined): string | null {
  if (!agente.isActive) return MOTIVOS.IA_DESLIGADA
  // Campo preenchido = modo teste. Se nada nele for numero, ninguem casa (a
  // equipe atende): o erro cai do lado seguro, nunca em "para todos".
  if (agente.onlyPhone?.trim() && !numerosDoTeste(agente.onlyPhone).some((n) => mesmoTelefone(n, telefoneCliente))) {
    return MOTIVOS.IA_SO_OUTRO_NUMERO
  }
  return null
}

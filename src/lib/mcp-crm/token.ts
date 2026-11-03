import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Segredos do MCP do super-admin (variaveis de ambiente do app):
 *   MCP_ADMIN_TOKEN          completo: le tudo e altera o prompt
 *   MCP_ADMIN_TOKEN_LEITURA  so leitura: as ferramentas de escrita nem aparecem
 *                            (pro Hermes que acompanha o WhatsApp de suporte)
 * Sem a variavel, o modo nao existe: o token cai na checagem de chave de API
 * e e recusado.
 *
 * Modulo separado (sem Prisma nem SDK do MCP) porque o authenticate() importa:
 * ele roda em toda rota.
 */

export const MCP_ADMIN_HEADER = 'x-mcp-admin'

/** Token curto e adivinhavel: melhor o modo nao existir. */
const MIN_TOKEN = 32

export type AcessoAdmin = 'completo' | 'leitura'

function confere(recebido: string, esperado: string | undefined): boolean {
  if (!esperado || esperado.length < MIN_TOKEN) return false
  // timingSafeEqual exige o mesmo tamanho; o hash iguala sem revelar o original.
  const a = createHash('sha256').update(recebido).digest()
  const b = createHash('sha256').update(esperado).digest()
  return timingSafeEqual(a, b)
}

export function acessoAdmin(token: string): AcessoAdmin | null {
  if (confere(token, process.env.MCP_ADMIN_TOKEN)) return 'completo'
  if (confere(token, process.env.MCP_ADMIN_TOKEN_LEITURA)) return 'leitura'
  return null
}

/** So o token completo vale no loopback (authenticate). */
export function tokenDoLoopbackConfere(token: string): boolean {
  return confere(token, process.env.MCP_ADMIN_TOKEN)
}

import { NextRequest, NextResponse } from 'next/server'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { verifyApiKey } from '@/lib/api/api-key-utils'
import { listarRestaurantes, ondeApareceTelefone, restauranteDe } from '@/lib/mcp-crm/admin'
import { acessoAdmin, type AcessoAdmin } from '@/lib/mcp-crm/token'
import { criarServidor } from '@/lib/mcp-crm/tools.mjs'

/**
 * MCP do CRM (Hermes, Claude Code, claude.ai): POST /api/mcp com a chave de
 * API do restaurante em `x-api-key` ou `Authorization: Bearer <chave>`. Com
 * MCP_ADMIN_TOKEN (ou o de leitura) no lugar da chave, vira o MCP do
 * super-admin, pra todos os restaurantes (src/lib/mcp-crm/admin.ts).
 *
 * A chave e o acesso: o MCP le e altera so o que ela ja alcanca pela API. As
 * ferramentas (src/lib/mcp-crm/tools.mjs) chamam a propria API pelo loopback
 * com a mesma chave, entao o isolamento por restaurante continua nas rotas de
 * sempre, e um MCP por restaurante e so trocar a chave no cliente.
 *
 * Sem sessao: cada POST monta servidor e transporte e descarta no fim (as
 * ferramentas nao guardam estado). GET (stream SSE) e DELETE (encerrar
 * sessao) nao se aplicam: 405.
 */

export const dynamic = 'force-dynamic'

/** Mesmo loopback do processamento de mensagens: nunca a URL publica. */
function urlInterna(): string {
  return process.env.INTERNAL_APP_URL || `http://127.0.0.1:${process.env.PORT || 3000}`
}

function chaveDoPedido(req: NextRequest): string | null {
  const direta = req.headers.get('x-api-key')?.trim()
  if (direta) return direta
  const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)
  return bearer ? bearer[1].trim() : null
}

/** Erro no formato JSON-RPC, que e o que o cliente MCP sabe mostrar. */
function erroRpc(status: number, code: number, message: string) {
  return NextResponse.json({ jsonrpc: '2.0', error: { code, message }, id: null }, { status })
}

/** Super-admin: o loopback usa sempre o token completo; quem decide o que aparece e `podeAlterar`. */
function servidorAdmin(acesso: AcessoAdmin) {
  return criarServidor({
    base: urlInterna(),
    admin: {
      token: process.env.MCP_ADMIN_TOKEN ?? '',
      podeAlterar: acesso === 'completo',
      restauranteDe,
      ondeApareceTelefone,
      listarRestaurantes,
    },
  })
}

export async function POST(req: NextRequest) {
  const chave = chaveDoPedido(req)
  // Sem dizer se faltou ou se esta errada: ajudaria quem tenta adivinhar.
  if (!chave) return erroRpc(401, -32001, 'Nao autorizado')

  let servidor: ReturnType<typeof criarServidor>
  const acesso = acessoAdmin(chave)
  if (acesso) {
    // O de leitura sozinho nao roda: o loopback precisa do completo.
    if (!process.env.MCP_ADMIN_TOKEN) return erroRpc(503, -32002, 'MCP do super-admin nao configurado')
    servidor = servidorAdmin(acesso)
  } else {
    const dados = await verifyApiKey(chave)
    if (!dados || !dados.isActive || (dados.expiresAt && dados.expiresAt < new Date())) {
      return erroRpc(401, -32001, 'Nao autorizado')
    }
    servidor = criarServidor({ base: urlInterna(), chave })
  }

  // Resposta em JSON (nao SSE): o transporte so devolve quando ela esta pronta.
  const transporte = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  try {
    await servidor.connect(transporte)
    return await transporte.handleRequest(req)
  } catch (error) {
    console.error('[mcp] falha ao atender:', error)
    return erroRpc(500, -32603, 'Erro interno do servidor')
  } finally {
    await transporte.close().catch(() => {})
    await servidor.close().catch(() => {})
  }
}

function semSessao() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } })
}

export const GET = semSessao
export const DELETE = semSessao

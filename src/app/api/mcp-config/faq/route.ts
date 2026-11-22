import { NextRequest, NextResponse } from 'next/server'
import { alterarFaq, alterarFaqSchema, listarFaq } from '@/lib/mcp-crm/configuracao'
import { autorizar, dadosInvalidos, responderErro } from '@/lib/mcp-crm/rota'

/**
 * Base de conhecimento pelo MCP (Hermes). Mesma tabela da tela
 * (Configurações > Base de conhecimento).
 *   GET  -> perguntas e respostas, com a versao de cada uma
 *   POST -> { motivo, simular?, alteracao: { acao: criar|editar|apagar, ... } }
 *           simular (padrao true) devolve o antes e o depois sem gravar.
 * Cada alteracao ja atualiza a busca da IA (nao precisa sincronizar).
 */

export async function GET(req: NextRequest) {
  try {
    const r = await autorizar(req, false)
    if ('erro' in r) return r.erro
    return NextResponse.json({ data: await listarFaq(r.companyId) })
  } catch (error) {
    return responderErro(error, 'Erro ao listar a base de conhecimento')
  }
}

export async function POST(req: NextRequest) {
  try {
    const r = await autorizar(req, true)
    if ('erro' in r) return r.erro
    const parsed = alterarFaqSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return dadosInvalidos(parsed.error)
    return NextResponse.json(await alterarFaq(r.companyId, parsed.data))
  } catch (error) {
    return responderErro(error, 'Erro ao alterar a base de conhecimento')
  }
}

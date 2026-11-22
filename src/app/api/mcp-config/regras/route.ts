import { NextRequest, NextResponse } from 'next/server'
import { alterarRegra, alterarRegraSchema, listarRegrasMcp } from '@/lib/mcp-crm/configuracao'
import { autorizar, dadosInvalidos, responderErro } from '@/lib/mcp-crm/rota'

/**
 * Regras de encaminhamento (eventos personalizados e atendimento humano) pelo
 * MCP (Hermes). Mesma tabela e mesma validacao da tela CRM > Regras.
 *   GET  -> regras (com versao), avisos de cada funil e o guia dos campos
 *   POST -> { motivo, simular?, alteracao: { acao: criar|editar|apagar, ... } }
 *           simular (padrao true) devolve o antes e o depois sem gravar.
 */

export async function GET(req: NextRequest) {
  try {
    const r = await autorizar(req, false)
    if ('erro' in r) return r.erro
    return NextResponse.json(await listarRegrasMcp(r.companyId))
  } catch (error) {
    return responderErro(error, 'Erro ao listar as regras')
  }
}

export async function POST(req: NextRequest) {
  try {
    const r = await autorizar(req, true)
    if ('erro' in r) return r.erro
    const parsed = alterarRegraSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return dadosInvalidos(parsed.error)
    return NextResponse.json(await alterarRegra(r.companyId, parsed.data))
  } catch (error) {
    return responderErro(error, 'Erro ao alterar a regra')
  }
}

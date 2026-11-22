import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { alterarFerramentas, alterarFerramentasSchema, listarFerramentas } from '@/lib/mcp-crm/configuracao'
import { autorizar, dadosInvalidos, responderErro } from '@/lib/mcp-crm/rota'

/**
 * Ferramentas da IA pelo MCP (Hermes).
 *   GET ?agentId= -> nativas (ligadas ou nao), modo do WhatsApp e o que a IA recebe
 *   POST          -> { motivo, versao, ligar?, desligar?, simular? } (so nativas;
 *                    integracoes e o modo do WhatsApp ficam na plataforma)
 */

export async function GET(req: NextRequest) {
  try {
    const r = await autorizar(req, false)
    if ('erro' in r) return r.erro
    const agentId = z.string().uuid().nullable().safeParse(req.nextUrl.searchParams.get('agentId'))
    if (!agentId.success) return dadosInvalidos(agentId.error)
    return NextResponse.json(await listarFerramentas(r.companyId, agentId.data))
  } catch (error) {
    return responderErro(error, 'Erro ao listar as ferramentas')
  }
}

export async function POST(req: NextRequest) {
  try {
    const r = await autorizar(req, true)
    if ('erro' in r) return r.erro
    const parsed = alterarFerramentasSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return dadosInvalidos(parsed.error)
    return NextResponse.json(await alterarFerramentas(r.companyId, parsed.data))
  } catch (error) {
    return responderErro(error, 'Erro ao alterar as ferramentas')
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { desfazerAlteracao, desfazerSchema, listarAlteracoes } from '@/lib/mcp-crm/configuracao'
import { autorizar, dadosInvalidos, responderErro } from '@/lib/mcp-crm/rota'

/**
 * Historico das alteracoes feitas pelo MCP (base de conhecimento, regras,
 * ferramentas) e o desfazer. O prompt tem historico proprio (ver_prompt).
 *   GET ?entidade=faq|regra|ferramentas&limite= -> mais recentes primeiro
 *   POST { id, motivo, simular? }                -> desfaz (padrao: so simula)
 */

const listarSchema = z.object({
  entidade: z.enum(['faq', 'regra', 'ferramentas']).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(30),
})

export async function GET(req: NextRequest) {
  try {
    const r = await autorizar(req, false)
    if ('erro' in r) return r.erro
    const sp = req.nextUrl.searchParams
    const parsed = listarSchema.safeParse({
      entidade: sp.get('entidade') ?? undefined,
      limite: sp.get('limite') ?? undefined,
    })
    if (!parsed.success) return dadosInvalidos(parsed.error)
    return NextResponse.json({ data: await listarAlteracoes(r.companyId, parsed.data.limite, parsed.data.entidade) })
  } catch (error) {
    return responderErro(error, 'Erro ao listar as alteracoes')
  }
}

export async function POST(req: NextRequest) {
  try {
    const r = await autorizar(req, true)
    if ('erro' in r) return r.erro
    const parsed = desfazerSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return dadosInvalidos(parsed.error)
    return NextResponse.json(await desfazerAlteracao(r.companyId, parsed.data))
  } catch (error) {
    return responderErro(error, 'Erro ao desfazer a alteracao')
  }
}

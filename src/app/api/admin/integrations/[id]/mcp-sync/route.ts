import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { handleApiError } from '@/lib/api/errors'
import { IntegrationHttpError } from '@/lib/ai-tools/http'
import { ErroRpcMcp } from '@/lib/ai-tools/mcp'
import { sincronizarMcp } from '@/lib/ai-tools/mcp-sync'
import { explicarFalhaFerramenta } from '@/lib/erros/ferramentas'
import {
  integrationInclude,
  isUuid,
  loadToolUsage,
  notFound,
  requireSuperAdmin,
  serializeIntegration,
} from '../../_shared'

/**
 * POST /api/admin/integrations/[id]/mcp-sync — conecta no servidor MCP da
 * integracao e traz as ferramentas dele pro catalogo (src/lib/ai-tools/mcp-sync.ts).
 * So super-admin.
 */

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.res

  try {
    const { id } = await params
    if (!isUuid(id)) return notFound('Integração não encontrada')

    const integracao = await prisma.integration.findUnique({ where: { id }, select: { name: true, kind: true } })
    if (!integracao) return notFound('Integração não encontrada')
    if (integracao.kind !== 'mcp') {
      return NextResponse.json({ error: 'Esta integração não é de servidor MCP.' }, { status: 400 })
    }

    let resumo
    try {
      resumo = await sincronizarMcp(id)
    } catch (err) {
      if (err instanceof IntegrationHttpError || err instanceof ErroRpcMcp) {
        const status = err instanceof IntegrationHttpError ? err.status ?? null : null
        const e = explicarFalhaFerramenta({ error: err.message, httpStatus: status, sistema: integracao.name })
        return NextResponse.json(
          {
            error: `Não consegui buscar as ferramentas: ${e.titulo}. ${e.oQueFazer ?? ''}`.trim(),
            tecnico: `${err.message}${err instanceof IntegrationHttpError && err.body ? ` | ${err.body}` : ''}`.slice(0, 600),
          },
          { status: 502 }
        )
      }
      throw err
    }

    const atualizada = await prisma.integration.findUniqueOrThrow({ where: { id }, include: integrationInclude })
    return NextResponse.json({
      integration: serializeIntegration(atualizada, await loadToolUsage(id)),
      resumo,
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao buscar ferramentas do servidor MCP')
  }
}

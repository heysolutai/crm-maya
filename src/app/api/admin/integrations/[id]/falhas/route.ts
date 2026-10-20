import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { handleApiError } from '@/lib/api/errors'
import { explicarFalhaFerramenta } from '@/lib/erros/ferramentas'
import { isUuid, notFound, requireSuperAdmin } from '../../_shared'

/**
 * GET /api/admin/integrations/[id]/falhas — o que a IA tentou fazer com esta
 * integracao nas ultimas 24h, em todos os restaurantes: quantas deram certo e
 * as falhas (explicadas + texto tecnico). Serve pra conferir, depois de mexer
 * no endereco ou na chave, se voltou a funcionar.
 *
 * So super-admin. Falha "normal" (faltou dado, pedido recusado pelo sistema)
 * entra so na contagem.
 */

type Params = { params: Promise<{ id: string }> }

const DIA_MS = 24 * 60 * 60 * 1000
const LIMITE = 30

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.res

  try {
    const { id } = await params
    if (!isUuid(id)) return notFound('Integração não encontrada')

    const integracao = await prisma.integration.findUnique({ where: { id }, select: { id: true, name: true } })
    if (!integracao) return notFound('Integração não encontrada')

    const desde = new Date(Date.now() - DIA_MS)
    const [deramCerto, falhas, ferramentas] = await Promise.all([
      prisma.aiToolCall.count({ where: { integrationId: id, ok: true, createdAt: { gte: desde } } }),
      prisma.aiToolCall.findMany({
        where: { integrationId: id, ok: false, createdAt: { gte: desde } },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true,
          toolName: true,
          error: true,
          httpStatus: true,
          createdAt: true,
          company: { select: { name: true } },
        },
      }),
      prisma.integrationTool.findMany({ where: { integrationId: id }, select: { name: true, label: true } }),
    ])
    const label = new Map(ferramentas.map((f) => [f.name, f.label]))

    const explicadas = falhas.map((f) => {
      const ferramenta = label.get(f.toolName) ?? f.toolName
      return {
        id: f.id,
        empresa: f.company.name,
        ferramenta,
        toolName: f.toolName,
        createdAt: f.createdAt,
        explicacao: explicarFalhaFerramenta({ error: f.error, httpStatus: f.httpStatus, sistema: integracao.name, ferramenta }),
        httpStatus: f.httpStatus,
        erro: f.error ? f.error.slice(0, 600) : null,
      }
    })
    const problemas = explicadas.filter((f) => f.explicacao.nivel !== 'normal')

    return NextResponse.json({
      deramCerto,
      normais: explicadas.length - problemas.length,
      totalFalhas: problemas.length,
      falhas: problemas.slice(0, LIMITE),
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao carregar falhas da integração')
  }
}

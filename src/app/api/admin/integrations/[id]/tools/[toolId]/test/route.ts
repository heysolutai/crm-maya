import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { handleApiError } from '@/lib/api/errors'
import { executeTool } from '@/lib/ai-tools/executor'
import { resolveToolForTest } from '@/lib/ai-tools/registry'
import { invalid, isUuid, notFound, readObject, requireSuperAdmin } from '../../../../_shared'

/**
 * POST /api/admin/integrations/[id]/tools/[toolId]/test
 * { companyId, arguments }
 *
 * Roda a ferramenta SALVA no contexto de teste do restaurante escolhido
 * (primeira caixa com ID do restaurante, cliente ficticio). Chama o sistema
 * externo de verdade, mas NAO aplica as acoes no CRM.
 *
 * Aqui o `error` tecnico volta pra tela: e o super-admin depurando, e o
 * executor nunca coloca segredo nele.
 */

const testSchema = z.object({
  companyId: z.string().refine(isUuid, 'Restaurante inválido'),
  arguments: z.record(z.string(), z.unknown()).default({}),
})

type Params = { params: Promise<{ id: string; toolId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.res

  try {
    const { id, toolId } = await params
    if (!isUuid(id) || !isUuid(toolId)) return notFound('Ferramenta não encontrada')

    const body = await readObject(req)
    if (!body) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    const validation = testSchema.safeParse(body)
    if (!validation.success) return invalid(validation.error)
    const { companyId, arguments: args } = validation.data

    const row = await prisma.integrationTool.findFirst({
      where: { id: toolId, integrationId: id },
      select: { name: true },
    })
    if (!row) return notFound('Ferramenta não encontrada')

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } })
    if (!company) return notFound('Restaurante não encontrado')

    const tool = await resolveToolForTest(companyId, row.name)
    if (!tool) return notFound('Ferramenta não encontrada')

    const r = await executeTool({
      companyId,
      conversationId: null,
      name: row.name,
      rawArgs: args,
      test: { tool },
    })

    return NextResponse.json({
      ok: r.ok,
      result: r.result,
      error: r.error ?? null,
      httpStatus: r.httpStatus ?? null,
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao testar ferramenta')
  }
}

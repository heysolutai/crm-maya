import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { handleApiError } from '@/lib/api/errors'
import {
  checkToolName,
  invalid,
  isPrismaUniqueError,
  isUuid,
  loadToolUsage,
  notFound,
  readObject,
  requireSuperAdmin,
  serializeTool,
  toolAsInput,
  toolData,
  toolSchema,
} from '../../../_shared'

/**
 * Uma ferramenta de uma integracao (super-admin).
 *
 * PUT e parcial (ausente = mantem). Renomear tambem atualiza a lista de
 * ferramentas ligadas de cada restaurante (CompanyIntegration.enabledTools)
 * e a ferramenta de teste da integracao, na mesma transacao: sem isso o
 * restaurante perderia a ferramenta em silencio. DELETE tira o nome dessas
 * listas.
 */

type Params = { params: Promise<{ id: string; toolId: string }> }

/** O que o super-admin muda numa ferramenta de servidor MCP. */
const mcpToolPatchSchema = z.object({
  label: z.string().trim().min(1, 'Informe o nome').max(120).optional(),
  isWrite: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

async function loadTool(id: string, toolId: string) {
  if (!isUuid(id) || !isUuid(toolId)) return null
  return prisma.integrationTool.findFirst({ where: { id: toolId, integrationId: id } })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.res

  try {
    const { id, toolId } = await params
    const current = await loadTool(id, toolId)
    if (!current) return notFound('Ferramenta não encontrada')

    const body = await readObject(req)
    if (!body) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })

    // Ferramenta de servidor MCP: caminho, corpo e parametros sao do servidor.
    // Aqui so muda o que e do CRM: nome pro restaurante, "muda dados" e ativa.
    const integracao = await prisma.integration.findUnique({ where: { id }, select: { kind: true } })
    if (integracao?.kind === 'mcp') {
      const v = mcpToolPatchSchema.safeParse(body)
      if (!v.success) return invalid(v.error)
      const atualizada = await prisma.integrationTool.update({
        where: { id: current.id },
        data: {
          ...(v.data.label !== undefined ? { label: v.data.label } : {}),
          ...(v.data.isWrite !== undefined ? { isWrite: v.data.isWrite } : {}),
          ...(v.data.isActive !== undefined ? { isActive: v.data.isActive } : {}),
        },
      })
      return NextResponse.json(serializeTool(atualizada, await loadToolUsage(id)))
    }

    const validation = toolSchema.safeParse({ ...toolAsInput(current), ...body })
    if (!validation.success) return invalid(validation.error)
    const input = validation.data

    const oldName = current.name
    const renamed = input.name !== oldName
    if (renamed) {
      const nameError = await checkToolName(input.name, current.id)
      if (nameError) return nameError
    }

    const updated = await prisma.$transaction(async (tx) => {
      const tool = await tx.integrationTool.update({
        where: { id: current.id },
        data: { ...toolData(input), sortOrder: input.sortOrder ?? current.sortOrder },
      })
      if (renamed) {
        // array_replace e atomico por linha: nao corre com o restaurante
        // ligando/desligando ferramentas ao mesmo tempo.
        await tx.$executeRaw`
          UPDATE company_integrations
          SET enabled_tools = array_replace(enabled_tools, ${oldName}::text, ${input.name}::text),
              updated_at = NOW()
          WHERE integration_id = ${id}::uuid AND ${oldName}::text = ANY(enabled_tools)
        `
        await tx.integration.updateMany({
          where: { id, testToolName: oldName },
          data: { testToolName: input.name },
        })
      }
      return tool
    })

    return NextResponse.json(serializeTool(updated, await loadToolUsage(id)))
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return NextResponse.json(
        { error: 'Já existe uma ferramenta com esse nome. O nome precisa ser único em todo o sistema.' },
        { status: 409 }
      )
    }
    return handleApiError(error, 'Erro ao atualizar ferramenta')
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.res

  try {
    const { id, toolId } = await params
    const current = await loadTool(id, toolId)
    if (!current) return notFound('Ferramenta não encontrada')

    await prisma.$transaction(async (tx) => {
      await tx.integrationTool.delete({ where: { id: current.id } })
      await tx.$executeRaw`
        UPDATE company_integrations
        SET enabled_tools = array_remove(enabled_tools, ${current.name}::text),
            updated_at = NOW()
        WHERE integration_id = ${id}::uuid AND ${current.name}::text = ANY(enabled_tools)
      `
      await tx.integration.updateMany({
        where: { id, testToolName: current.name },
        data: { testToolName: null },
      })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro ao excluir ferramenta')
  }
}

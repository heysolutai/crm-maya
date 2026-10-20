import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { handleApiError } from '@/lib/api/errors'
import { mergeHeaders } from '@/lib/ai-tools/secrets'
import {
  integrationAsInput,
  integrationInclude,
  integrationSchema,
  invalid,
  isPrismaUniqueError,
  isUuid,
  loadToolUsage,
  normalizeConfigFields,
  notFound,
  readObject,
  requireSuperAdmin,
  serializeIntegration,
} from '../_shared'

/**
 * Uma integracao do catalogo (super-admin).
 *
 * PUT e parcial: campos ausentes mantem o valor atual. Cabecalhos com MASK
 * mantem o valor salvo; string vazia (ou cabecalho ausente da lista) remove.
 * DELETE apaga em cascata as ferramentas e as ativacoes dos restaurantes.
 */

type Params = { params: Promise<{ id: string }> }

async function load(id: string) {
  return prisma.integration.findUnique({ where: { id }, include: integrationInclude })
}

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.res

  try {
    const { id } = await params
    if (!isUuid(id)) return notFound('Integração não encontrada')
    const row = await load(id)
    if (!row) return notFound('Integração não encontrada')
    return NextResponse.json(serializeIntegration(row, await loadToolUsage(id)))
  } catch (error) {
    return handleApiError(error, 'Erro ao buscar integração')
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.res

  try {
    const { id } = await params
    if (!isUuid(id)) return notFound('Integração não encontrada')
    const current = await load(id)
    if (!current) return notFound('Integração não encontrada')

    const body = await readObject(req)
    if (!body) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })

    const validation = integrationSchema.safeParse({ ...integrationAsInput(current), ...body })
    if (!validation.success) return invalid(validation.error)
    const input = validation.data

    if (input.slug !== current.slug) {
      const taken = await prisma.integration.findUnique({ where: { slug: input.slug }, select: { id: true } })
      if (taken && taken.id !== id) {
        return NextResponse.json(
          { error: `Já existe uma integração com o identificador "${input.slug}".` },
          { status: 409 }
        )
      }
    }

    // A ferramenta do botao "Testar" do restaurante tem que ser desta integracao.
    const testToolName = input.testToolName || null
    if (testToolName && !current.tools.some((t) => t.name === testToolName)) {
      return NextResponse.json(
        { error: 'A ferramenta de teste precisa ser uma ferramenta desta integração.' },
        { status: 400 }
      )
    }

    const updated = await prisma.integration.update({
      where: { id },
      data: {
        slug: input.slug,
        name: input.name,
        description: input.description || null,
        segment: input.segment || null,
        icon: input.icon || null,
        kind: input.kind ?? current.kind,
        baseUrl: input.baseUrl,
        headers: mergeHeaders(current.headers, input.headers),
        configFields: normalizeConfigFields(input.configFields) as unknown as Prisma.InputJsonValue,
        testToolName,
        testArgs: input.testArgs ? (input.testArgs as Prisma.InputJsonValue) : Prisma.DbNull,
        isActive: input.isActive ?? current.isActive,
      },
      include: integrationInclude,
    })

    return NextResponse.json(serializeIntegration(updated, await loadToolUsage(id)))
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return NextResponse.json({ error: 'Já existe uma integração com esse identificador.' }, { status: 409 })
    }
    return handleApiError(error, 'Erro ao atualizar integração')
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.res

  try {
    const { id } = await params
    if (!isUuid(id)) return notFound('Integração não encontrada')
    const existing = await prisma.integration.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return notFound('Integração não encontrada')

    // Cascata (schema): ferramentas + ativacoes dos restaurantes.
    await prisma.integration.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro ao excluir integração')
  }
}

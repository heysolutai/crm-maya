import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { handleApiError } from '@/lib/api/errors'
import { NATIVE_TOOL_NAMES } from '@/lib/ai-tools/native'
import { mergeHeaders } from '@/lib/ai-tools/secrets'
import { ensureDefaultIntegrations } from '@/lib/ai-tools/seed'
import {
  integrationInclude,
  integrationSchema,
  invalid,
  isPrismaUniqueError,
  loadToolUsage,
  normalizeConfigFields,
  readObject,
  requireSuperAdmin,
  serializeIntegration,
} from './_shared'

/**
 * Catalogo de integracoes da IA (super-admin).
 *
 * GET  /api/admin/integrations  -> todas, com ferramentas e quantos restaurantes usam
 * POST /api/admin/integrations  -> cria (as ferramentas vem depois, em /[id]/tools)
 *
 * Cabecalhos da plataforma nunca saem daqui: vao como { nome: MASK }.
 */

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.res

  try {
    // Catalogo nunca vazio: garante o modelo padrao (Reserve Maya).
    await ensureDefaultIntegrations()

    const [rows, usage] = await Promise.all([
      prisma.integration.findMany({
        // So o catalogo: conexoes MCP privadas de restaurante ficam no WhatsApp dono.
        where: { companyId: null },
        include: integrationInclude,
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
      loadToolUsage(),
    ])

    return NextResponse.json({
      integrations: rows.map((row) => serializeIntegration(row, usage)),
      // Nomes que uma ferramenta de integracao nao pode usar (validacao na tela).
      reservedNames: NATIVE_TOOL_NAMES,
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao listar integrações')
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.res

  try {
    const body = await readObject(req)
    if (!body) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })

    const validation = integrationSchema.safeParse({ headers: {}, configFields: [], ...body })
    if (!validation.success) return invalid(validation.error)
    const input = validation.data

    const existing = await prisma.integration.findUnique({ where: { slug: input.slug }, select: { id: true } })
    if (existing) {
      return NextResponse.json(
        { error: `Já existe uma integração com o identificador "${input.slug}".` },
        { status: 409 }
      )
    }

    const created = await prisma.integration.create({
      data: {
        slug: input.slug,
        name: input.name,
        description: input.description || null,
        segment: input.segment || null,
        icon: input.icon || null,
        kind: input.kind ?? 'http',
        baseUrl: input.baseUrl,
        headers: mergeHeaders(null, input.headers),
        configFields: normalizeConfigFields(input.configFields) as unknown as Prisma.InputJsonValue,
        // Ainda nao ha ferramentas: a de teste e escolhida depois de criar.
        testToolName: null,
        testArgs: input.testArgs ? (input.testArgs as Prisma.InputJsonValue) : Prisma.DbNull,
        isActive: input.isActive ?? true,
      },
      include: integrationInclude,
    })

    return NextResponse.json(serializeIntegration(created), { status: 201 })
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return NextResponse.json({ error: 'Já existe uma integração com esse identificador.' }, { status: 409 })
    }
    return handleApiError(error, 'Erro ao criar integração')
  }
}

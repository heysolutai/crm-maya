import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { handleApiError } from '@/lib/api/errors'
import {
  checkToolName,
  invalid,
  isPrismaUniqueError,
  isUuid,
  notFound,
  readObject,
  requireSuperAdmin,
  serializeTool,
  TOOL_DEFAULTS,
  toolData,
  toolSchema,
} from '../../_shared'

/**
 * POST /api/admin/integrations/[id]/tools -> cria uma ferramenta na integracao.
 *
 * O nome e o que a IA chama: snake_case, unico no sistema todo e diferente
 * das ferramentas nativas do CRM.
 */

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.res

  try {
    const { id } = await params
    if (!isUuid(id)) return notFound('Integração não encontrada')
    const integration = await prisma.integration.findUnique({
      where: { id },
      select: { id: true, _count: { select: { tools: true } } },
    })
    if (!integration) return notFound('Integração não encontrada')

    const body = await readObject(req)
    if (!body) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })

    const validation = toolSchema.safeParse({ ...TOOL_DEFAULTS, ...body })
    if (!validation.success) return invalid(validation.error)
    const input = validation.data

    const nameError = await checkToolName(input.name)
    if (nameError) return nameError

    const created = await prisma.integrationTool.create({
      data: {
        integrationId: id,
        ...toolData(input),
        // Sem ordem informada: vai pro fim da lista.
        sortOrder: input.sortOrder ?? integration._count.tools,
      },
    })

    return NextResponse.json(serializeTool(created), { status: 201 })
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return NextResponse.json(
        { error: 'Já existe uma ferramenta com esse nome. O nome precisa ser único em todo o sistema.' },
        { status: 409 }
      )
    }
    return handleApiError(error, 'Erro ao criar ferramenta')
  }
}

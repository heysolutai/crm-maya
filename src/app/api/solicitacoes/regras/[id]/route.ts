import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { isCompanyAdmin } from '@/lib/api/company-admin'
import { camposDaRegra, paraRegra, telefonesSchema } from '@/lib/solicitacoes/api'
import { limparCacheEquipe } from '@/lib/solicitacoes/avisos'

/**
 * Uma regra de encaminhamento. So o admin do restaurante.
 *   PUT    -> editar (a regra automatica so liga/desliga e troca a etiqueta)
 *   DELETE -> apagar (a automatica nao se apaga). As solicitacoes ja abertas
 *             ficam com o nome da categoria.
 */

type Ctx = { params: Promise<{ id: string }> }

const editarSchema = z.object({
  name: camposDaRegra.name.optional(),
  tag: camposDaRegra.tag.optional(),
  trigger: camposDaRegra.trigger.optional(),
  notWhen: camposDaRegra.notWhen.optional(),
  examples: camposDaRegra.examples.optional(),
  collectFields: camposDaRegra.collectFields.optional(),
  askMessage: camposDaRegra.askMessage.optional(),
  flowMode: camposDaRegra.flowMode.optional(),
  introMessage: camposDaRegra.introMessage.optional(),
  introImages: camposDaRegra.introImages.optional(),
  responseMessage: camposDaRegra.responseMessage.optional(),
  responseMode: camposDaRegra.responseMode.optional(),
  pauseAi: camposDaRegra.pauseAi.optional(),
  notifyPhones: telefonesSchema.optional(),
  isActive: camposDaRegra.isActive.optional(),
})

async function carregar(req: NextRequest, params: Ctx['params']) {
  const auth = await authenticate(req)
  if (!auth.companyId) return { erro: NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 }) }
  if (!(await isCompanyAdmin(auth))) {
    return { erro: NextResponse.json({ error: 'Apenas o administrador do restaurante pode mudar as regras' }, { status: 403 }) }
  }
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return { erro: NextResponse.json({ error: 'Nao encontrado' }, { status: 404 }) }
  // IDOR: so regra deste restaurante.
  const regra = await prisma.handoffRule.findFirst({ where: { id, companyId: auth.companyId } })
  if (!regra) return { erro: NextResponse.json({ error: 'Nao encontrado' }, { status: 404 }) }
  return { regra, companyId: auth.companyId }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const r = await carregar(req, params)
    if ('erro' in r) return r.erro

    const parsed = editarSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }
    // Regra automatica (falha da IA): o texto e do sistema; da para ligar,
    // desligar, trocar a etiqueta e quem e avisado.
    const p = parsed.data
    const dados = r.regra.isSystem
      ? {
          ...(p.isActive !== undefined ? { isActive: p.isActive } : {}),
          ...(p.tag ? { tag: p.tag } : {}),
          ...(p.notifyPhones ? { notifyPhones: p.notifyPhones } : {}),
        }
      : p

    await prisma.handoffRule.updateMany({ where: { id: r.regra.id, companyId: r.companyId }, data: dados })
    if (p.notifyPhones) limparCacheEquipe(r.companyId)
    const atualizada = await prisma.handoffRule.findFirst({ where: { id: r.regra.id, companyId: r.companyId } })
    if (!atualizada) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })
    return NextResponse.json(paraRegra(atualizada))
  } catch (error) {
    return handleApiError(error, 'Erro ao salvar regra de encaminhamento')
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const r = await carregar(req, params)
    if ('erro' in r) return r.erro
    if (r.regra.isSystem) {
      return NextResponse.json({ error: 'A regra automática não pode ser apagada; desligue se não quiser usar.' }, { status: 409 })
    }
    await prisma.handoffRule.deleteMany({ where: { id: r.regra.id, companyId: r.companyId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro ao apagar regra de encaminhamento')
  }
}

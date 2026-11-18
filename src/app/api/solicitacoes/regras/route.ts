import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { isCompanyAdmin } from '@/lib/api/company-admin'
import { listarRegras } from '@/lib/solicitacoes/servico'
import { camposDaRegra, chaveDaRegra, paraRegra, telefonesSchema } from '@/lib/solicitacoes/api'
import { limparCacheEquipe } from '@/lib/solicitacoes/avisos'

/**
 * Regras de encaminhamento (quando a IA abre uma solicitacao e o que responde).
 *   GET  -> todas as regras do restaurante (cria as padrao na primeira vez)
 *   POST -> nova regra (categoria). So o admin do restaurante.
 */

const regraSchema = z.object({
  funnel: z.enum(['eventos', 'atendimento']),
  name: camposDaRegra.name,
  tag: camposDaRegra.tag,
  trigger: camposDaRegra.trigger,
  notWhen: camposDaRegra.notWhen.default(''),
  examples: camposDaRegra.examples.default([]),
  collectFields: camposDaRegra.collectFields.default([]),
  askMessage: camposDaRegra.askMessage.default(''),
  flowMode: camposDaRegra.flowMode.default('coletar'),
  introMessage: camposDaRegra.introMessage.default(''),
  introImages: camposDaRegra.introImages.default([]),
  responseMessage: camposDaRegra.responseMessage.default(''),
  responseMode: camposDaRegra.responseMode.default('adaptar'),
  pauseAi: camposDaRegra.pauseAi.default(true),
  notifyPhones: telefonesSchema.default([]),
  isActive: camposDaRegra.isActive.default(true),
})

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
    const regras = await listarRegras(companyId)
    return NextResponse.json({ regras: regras.map(paraRegra) })
  } catch (error) {
    return handleApiError(error, 'Erro ao listar regras de encaminhamento')
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticate(req)
    const companyId = auth.companyId
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
    if (!(await isCompanyAdmin(auth))) {
      return NextResponse.json({ error: 'Apenas o administrador do restaurante pode criar regras' }, { status: 403 })
    }

    const parsed = regraSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }
    const d = parsed.data

    // Chave unica no restaurante (a IA escolhe por ela): nome + sufixo se repetir.
    const base = chaveDaRegra(d.name)
    const existentes = await prisma.handoffRule.findMany({
      where: { companyId, key: { startsWith: base } },
      select: { key: true },
    })
    const usadas = new Set(existentes.map((e) => e.key))
    let key = base
    for (let i = 2; usadas.has(key); i++) key = `${base}_${i}`

    const ultima = await prisma.handoffRule.findFirst({
      where: { companyId, funnel: d.funnel },
      select: { sortOrder: true },
      orderBy: { sortOrder: 'desc' },
    })

    const regra = await prisma.handoffRule.create({
      data: { companyId, key, ...d, sortOrder: (ultima?.sortOrder ?? 0) + 1 },
    })
    limparCacheEquipe(companyId)
    return NextResponse.json(paraRegra(regra), { status: 201 })
  } catch (error) {
    return handleApiError(error, 'Erro ao criar regra de encaminhamento')
  }
}

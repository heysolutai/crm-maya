import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { FUNIS, etapasAbertas, type Funil } from '@/lib/solicitacoes/funis'
import { abrirSolicitacao, garantirRegras } from '@/lib/solicitacoes/servico'
import { INCLUDE_CARD, paraCard } from '@/lib/solicitacoes/api'

/**
 * Solicitacoes (funis de eventos personalizados e de atendimento humano).
 *   GET  ?funil=eventos|atendimento&busca=  -> cards do quadro + resumo do mes
 *   POST                                     -> a equipe abre uma solicitacao a mao
 */

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD')

const listarSchema = z.object({
  funil: z.enum(['eventos', 'atendimento']),
  busca: z.string().trim().max(100).optional(),
  /** Periodo (dias de Sao Paulo, inclusivo). Sem: ultimos 30 dias. */
  desde: dia.optional(),
  ate: dia.optional(),
})

/** Hoje em Sao Paulo (AAAA-MM-DD). */
function hojeSaoPaulo(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

function somarDias(diaIso: string, n: number): string {
  const d = new Date(`${diaIso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const criarSchema = z.object({
  funil: z.enum(['eventos', 'atendimento']),
  ruleId: z.string().uuid().optional(),
  nome: z.string().trim().min(1, 'Informe o nome do cliente').max(200),
  telefone: z.string().trim().max(40).optional(),
  resumo: z.string().trim().max(2000).optional(),
  valor: z.number().min(0).max(100_000_000).nullable().optional(),
})

/** Periodo padrao do quadro e dos numeros. */
const PERIODO_PADRAO_DIAS = 30

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })

    const sp = req.nextUrl.searchParams
    const parsed = listarSchema.safeParse({
      funil: sp.get('funil') ?? undefined,
      busca: sp.get('busca') ?? undefined,
      desde: sp.get('desde') ?? undefined,
      ate: sp.get('ate') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }
    const funil: Funil = parsed.data.funil
    const busca = parsed.data.busca

    // Periodo em dias de Sao Paulo: do inicio do "desde" ao fim do "ate".
    const ateDia = parsed.data.ate ?? hojeSaoPaulo()
    const desdeDia = parsed.data.desde ?? somarDias(ateDia, -(PERIODO_PADRAO_DIAS - 1))
    if (desdeDia > ateDia) return NextResponse.json({ error: 'A data inicial é depois da final' }, { status: 400 })
    const inicio = new Date(`${desdeDia}T00:00:00-03:00`)
    const fim = new Date(`${somarDias(ateDia, 1)}T00:00:00-03:00`)

    await garantirRegras(companyId)

    const abertas = etapasAbertas(funil)

    const where: Prisma.HandoffRequestWhereInput = {
      companyId,
      funnel: funil,
      createdAt: { gte: inicio, lt: fim },
      AND: [
        ...(busca
          ? [
              {
                OR: [
                  { customerName: { contains: busca, mode: 'insensitive' as const } },
                  { customerPhone: { contains: busca.replace(/\D/g, '') || busca } },
                  { summary: { contains: busca, mode: 'insensitive' as const } },
                  { category: { contains: busca, mode: 'insensitive' as const } },
                ],
              },
            ]
          : []),
      ],
    }

    const [linhas, doMes, equipe] = await Promise.all([
      prisma.handoffRequest.findMany({ where, include: INCLUDE_CARD, orderBy: { createdAt: 'desc' }, take: 1000 }),
      // Numeros do periodo (sem a busca: o resumo e do periodo inteiro).
      prisma.handoffRequest.findMany({
        where: { companyId, funnel: funil, createdAt: { gte: inicio, lt: fim } },
        select: { category: true, stage: true, estimatedValue: true, createdAt: true, firstResponseAt: true },
        take: 5000,
      }),
      prisma.user.findMany({
        where: { isActive: true, OR: [{ companyId }, { userRoles: { some: { companyId } } }], NOT: { userRoles: { some: { role: 'super_admin' } } } },
        select: { id: true, fullName: true, email: true },
        orderBy: { fullName: 'asc' },
        take: 200,
      }),
    ])

    // Resumo do mes (criadas no mes corrente).
    const porCategoria = new Map<string, number>()
    let tempoTotalMin = 0
    let atendidas = 0
    for (const r of doMes) {
      porCategoria.set(r.category, (porCategoria.get(r.category) ?? 0) + 1)
      if (r.firstResponseAt) {
        tempoTotalMin += Math.max(0, r.firstResponseAt.getTime() - r.createdAt.getTime()) / 60000
        atendidas++
      }
    }
    const valorDe = (rs: { estimatedValue: Prisma.Decimal | null }[]) => rs.reduce((s, r) => s + (r.estimatedValue != null ? Number(r.estimatedValue) : 0), 0)
    const fechadosMes = doMes.filter((r) => r.stage === 'fechado')
    const abertasAgora = doMes.filter((r) => abertas.includes(r.stage))

    return NextResponse.json({
      funil,
      periodo: { desde: desdeDia, ate: ateDia },
      etapas: FUNIS[funil].etapas,
      itens: linhas.map(paraCard),
      resumo: {
        noMes: doMes.length,
        abertasAgora: abertasAgora.length,
        porCategoria: [...porCategoria.entries()].map(([categoria, total]) => ({ categoria, total })).sort((a, b) => b.total - a.total),
        tempoMedioAtendimentoMin: atendidas ? Math.round(tempoTotalMin / atendidas) : null,
        fechadosNoMes: fechadosMes.length,
        valorFechadoNoMes: valorDe(fechadosMes),
        valorEmAberto: valorDe(abertasAgora),
      },
      equipe: equipe.map((u) => ({ id: u.id, name: u.fullName || u.email })),
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao listar solicitacoes')
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })

    const parsed = criarSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }
    const { funil, ruleId, nome, telefone, resumo, valor } = parsed.data

    await garantirRegras(companyId)
    // IDOR: a regra vem do body, tem que ser deste restaurante e deste funil.
    const regra = ruleId
      ? await prisma.handoffRule.findFirst({ where: { id: ruleId, companyId, funnel: funil } })
      : await prisma.handoffRule.findFirst({ where: { companyId, funnel: funil, isSystem: false }, orderBy: { sortOrder: 'asc' } })
    if (!regra) return NextResponse.json({ error: 'Categoria invalida' }, { status: 400 })

    const { id } = await abrirSolicitacao({
      companyId,
      regra,
      conversationId: null,
      clientId: null,
      clienteNome: nome,
      clienteTelefone: telefone?.replace(/\D/g, '') || null,
      resumo: resumo || null,
      valorEstimado: valor ?? null,
      origem: 'atendente',
      actor: 'agent',
    })
    const criada = await prisma.handoffRequest.findFirst({ where: { id, companyId }, include: INCLUDE_CARD })
    if (!criada) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })
    return NextResponse.json(paraCard(criada), { status: 201 })
  } catch (error) {
    return handleApiError(error, 'Erro ao criar solicitacao')
  }
}

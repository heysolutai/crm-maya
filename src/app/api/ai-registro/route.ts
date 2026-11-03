import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { isCompanyAdmin } from '@/lib/api/company-admin'
import { ESPERA_RESPOSTA_DA_IA, explicarTurno, MOTIVOS, SEM_RESPOSTA_APOS_MS } from '@/lib/ai/motivos'

/**
 * GET /api/ai-registro — Registro da IA do restaurante (so administrador: as
 * mensagens dos clientes aparecem aqui).
 *
 *   filtro: todos | problemas | nao_respondidas | respondidas
 *   antes:  data (ISO) do ultimo item carregado, pra "Carregar mais"
 *   inboxId: so as conversas de uma conexao
 *
 * 30 por pagina, mais recentes primeiro.
 */

const PAGINA = 30

const querySchema = z.object({
  filtro: z.enum(['todos', 'problemas', 'nao_respondidas', 'respondidas']).optional().default('todos'),
  antes: z.string().datetime().optional(),
  inboxId: z.string().uuid().optional(),
})

function filtroWhere(filtro: string): Prisma.AiTurnWhereInput {
  const semResposta: Prisma.AiTurnWhereInput = {
    ...ESPERA_RESPOSTA_DA_IA,
    createdAt: { lt: new Date(Date.now() - SEM_RESPOSTA_APOS_MS) },
  }
  switch (filtro) {
    case 'respondidas':
      return { status: 'respondido' }
    case 'nao_respondidas':
      return { OR: [{ status: { in: ['ignorado', 'erro'] } }, semResposta] }
    case 'problemas':
      return { OR: [{ status: 'erro' }, { status: 'ignorado', motivo: MOTIVOS.SEM_FLUXO }, semResposta] }
    default:
      return {}
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req)
    if (!auth.companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
    if (!(await isCompanyAdmin(auth))) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    const sp = req.nextUrl.searchParams
    const parsed = querySchema.safeParse({
      filtro: sp.get('filtro') ?? undefined,
      antes: sp.get('antes') ?? undefined,
      inboxId: sp.get('inboxId') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }
    const { filtro, antes, inboxId } = parsed.data

    const where: Prisma.AiTurnWhereInput = {
      AND: [
        { companyId: auth.companyId },
        antes ? { createdAt: { lt: new Date(antes) } } : {},
        inboxId ? { conversation: { inboxId } } : {},
        filtroWhere(filtro),
      ],
    }

    const turnos = await prisma.aiTurn.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: PAGINA + 1,
      include: {
        conversation: {
          select: {
            id: true,
            inbox: { select: { id: true, displayName: true, instanceName: true } },
            client: { select: { firstName: true, lastName: true, fullName: true, phone: true } },
          },
        },
      },
    })

    const temMais = turnos.length > PAGINA
    const pagina = turnos.slice(0, PAGINA)

    return NextResponse.json({
      data: pagina.map((t) => {
        const c = t.conversation.client
        return {
          id: t.id,
          createdAt: t.createdAt,
          status: t.status,
          motivo: t.motivo,
          texto: t.texto,
          resposta: t.resposta,
          respondidoEm: t.respondidoEm,
          latencyMs: t.latencyMs,
          bloqueios: t.bloqueios,
          pausadoAte: t.pausadoAte,
          mensagens: t.messageIds.length,
          explicacao: explicarTurno(t),
          conversationId: t.conversation.id,
          conexao: t.conversation.inbox?.displayName || t.conversation.inbox?.instanceName || null,
          contato: {
            nome: c ? (c.fullName || `${c.firstName} ${c.lastName || ''}`).trim() : null,
            telefone: c?.phone ?? null,
          },
        }
      }),
      proximo: temMais ? pagina[pagina.length - 1].createdAt.toISOString() : null,
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao carregar o registro da IA')
  }
}

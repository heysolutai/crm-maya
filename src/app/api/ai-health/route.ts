import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import type { AuthResult } from '@/lib/api/types'
import type { ItemSituacao, SituacaoResposta } from '@/components/situacao/types'
import { SELECT_INBOX, VERIFICACOES, type Contexto, type InboxVerificada } from './verificacoes'

/**
 * GET /api/ai-health?inboxId=<uuid opcional> — painel "Situação": o que está
 * impedindo a IA (ou o WhatsApp) de atender, em palavras simples, com o que
 * fazer e o botão que leva até lá.
 *
 *   sem inboxId: todos os WhatsApp ativos do restaurante (Dashboard)
 *   com inboxId: só aquele WhatsApp (aba "Agente de IA" da conexão)
 *
 * Qualquer usuário do restaurante lê (nada de segredo sai daqui). Uma
 * verificação que falha é pulada e logada: o painel nunca quebra a tela.
 */

const querySchema = z.object({ inboxId: z.string().uuid().optional() })

/** Telas que só o administrador abre (menu "Gestão"). */
const SO_ADMIN = ['/app/inboxes', '/app/ai-registro', '/app/events']
/** Atendimentos: administrador, gerente e atendente. */
const ATENDIMENTO = ['/app/conversations']

interface Papel {
  admin: boolean
  atende: boolean
}

async function papelDe(auth: AuthResult): Promise<Papel> {
  if (auth.isSuperAdmin) return { admin: true, atende: true }
  if (!auth.agentId || !auth.companyId) return { admin: false, atende: false }
  try {
    const roles = await prisma.userRole.findMany({
      where: { userId: auth.agentId, companyId: auth.companyId },
      select: { role: true },
    })
    const r = new Set<string>(roles.map((x) => x.role))
    const admin = r.has('company_admin')
    return { admin, atende: admin || r.has('manager') || r.has('agent') }
  } catch (err) {
    console.error('[ai-health] falha ao ler o papel do usuario:', (err as Error)?.message)
    return { admin: false, atende: false }
  }
}

function comeca(href: string, rotas: string[]): boolean {
  return rotas.some((r) => href === r || href.startsWith(`${r}/`) || href.startsWith(`${r}?`))
}

/** O mesmo item, sem o botão e com outro "O que fazer". */
function semBotao(item: ItemSituacao, oQueFazer: string): ItemSituacao {
  return {
    id: item.id,
    nivel: item.nivel,
    titulo: item.titulo,
    detalhe: item.detalhe,
    oQueFazer,
    ...(item.tecnico ? { tecnico: item.tecnico } : {}),
  }
}

/**
 * Quem não pode abrir a tela do botão não recebe o botão (cairia em "acesso
 * restrito"): ganha o caminho que tem, ou o recado de chamar o administrador.
 */
function ajustarAoPapel(item: ItemSituacao, papel: Papel): ItemSituacao {
  const href = item.acao?.href
  if (!href) return item

  if (comeca(href, SO_ADMIN) && !papel.admin) {
    if (href.startsWith('/app/ai-registro') && papel.atende) {
      return {
        ...item,
        oQueFazer:
          'Responda pela tela de Atendimentos os clientes que estão esperando. Se continuar acontecendo, avise o administrador do restaurante.',
        acao: { label: 'Ver conversas', href: '/app/conversations' },
      }
    }
    return semBotao(item, `${item.oQueFazer} Quem pode fazer isso é o administrador do restaurante: avise ele.`)
  }

  if (comeca(href, ATENDIMENTO) && !papel.atende) {
    return semBotao(item, `${item.oQueFazer} Se você não atende clientes, avise a equipe.`)
  }
  return item
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req)
    if (!auth.companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
    const companyId = auth.companyId

    const parsed = querySchema.safeParse({ inboxId: req.nextUrl.searchParams.get('inboxId') ?? undefined })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }
    const { inboxId } = parsed.data

    let inboxes: InboxVerificada[]
    if (inboxId) {
      // IDOR: o WhatsApp precisa ser do restaurante.
      const inbox = await prisma.inbox.findFirst({ where: { id: inboxId, companyId }, select: SELECT_INBOX })
      if (!inbox) return NextResponse.json({ error: 'WhatsApp nao encontrado' }, { status: 404 })
      inboxes = [inbox]
    } else {
      inboxes = await prisma.inbox.findMany({
        where: { companyId, isActive: true },
        orderBy: { createdAt: 'asc' },
        select: SELECT_INBOX,
      })
    }

    const ctx: Contexto = { companyId, inboxes, inboxUnica: inboxId ?? null, superAdmin: auth.isSuperAdmin === true }

    const papelP = papelDe(auth)
    const resultados: ItemSituacao[][] = await Promise.all(
      VERIFICACOES.map(async (v): Promise<ItemSituacao[]> => {
        try {
          return await v.rodar(ctx)
        } catch (err) {
          console.error(`[ai-health] verificacao "${v.nome}" falhou (pulada):`, err)
          return []
        }
      })
    )
    const papel = await papelP

    const todos = resultados.flat().map((item) => ajustarAoPapel(item, papel))
    // Problemas primeiro; dentro do nível, a ordem das verificações.
    const itens = [...todos.filter((i) => i.nivel === 'problema'), ...todos.filter((i) => i.nivel === 'aviso')]

    const resposta: SituacaoResposta = {
      status: itens.some((i) => i.nivel === 'problema') ? 'problema' : itens.length ? 'aviso' : 'ok',
      itens,
      verificadoEm: new Date().toISOString(),
    }
    return NextResponse.json(resposta)
  } catch (error) {
    return handleApiError(error, 'Erro ao verificar a situação da IA')
  }
}

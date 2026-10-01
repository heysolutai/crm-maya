import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

/**
 * Atributos personalizados do contato (Client.customFields).
 *
 * A escrita e um MERGE no servidor, nunca um replace do mapa inteiro: o painel
 * manda so o que mudou (`set`) e o que saiu (`remove`). Enviar o mapa completo
 * a partir do cache do navegador apagaria (a) o que outro atendente gravou
 * enquanto essa tela estava aberta — o mesmo contato pode estar aberto em duas
 * conversas, uma por numero — e (b) qualquer chave que o painel nao exibe
 * (valor que nao e texto, dado gravado por outro fluxo).
 */

const MAX_ATRIBUTOS = 30
const MAX_CHAVE = 40
const MAX_VALOR = 500

const schema = z.object({
  clientId: z.string().uuid(),
  set: z.record(z.string().min(1).max(MAX_CHAVE), z.string().max(MAX_VALOR)).optional(),
  remove: z.array(z.string().min(1).max(MAX_CHAVE)).max(MAX_ATRIBUTOS).optional(),
})

/** Chave iniciada por "_" e de uso interno de outros fluxos — o painel nao mexe. */
const interna = (chave: string) => chave.startsWith('_')

/**
 * Atributos de UM contato.
 *
 * Endpoint proprio em vez de reaproveitar o GET /api/clients: aquele devolve a
 * lista inteira (ate 1000 contatos, com agendamentos e vendas de cada um) e
 * carregar tudo isso pra ler o customFields de um seria desperdicio a cada
 * conversa aberta.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
  }

  try {
    const clientId = req.nextUrl.searchParams.get('clientId')
    if (!clientId) {
      return NextResponse.json({ error: 'clientId obrigatorio' }, { status: 400 })
    }

    // IDOR: so devolve contato da empresa autenticada.
    const cliente = await prisma.client.findFirst({
      where: { id: clientId, companyId: auth.companyId },
      select: { id: true, customFields: true },
    })
    if (!cliente) {
      return NextResponse.json({ error: 'Contato nao encontrado' }, { status: 404 })
    }

    return NextResponse.json(cliente)
  } catch (error) {
    return handleApiError(error, 'Erro ao buscar atributos do contato')
  }
}

export async function PUT(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
  }
  const companyId = auth.companyId

  try {
    // Permissao de CRM no SERVIDOR: o gate da tela some com um fetch na mao.
    // Vale para usuario logado; chamada por API key (agentId nulo) e uma
    // credencial da propria empresa, tratada como integracao — mesmo criterio
    // do resto da API.
    if (!auth.isSuperAdmin && auth.agentId) {
      const papel = await prisma.userRole.findFirst({
        where: { userId: auth.agentId, companyId },
        select: { role: true },
      })
      const permissao = papel
        ? await prisma.rolePermission.findFirst({
            where: { companyId, role: papel.role },
            select: { crmAccess: true },
          })
        : null
      const acesso = permissao?.crmAccess ?? (papel?.role === 'viewer' ? 'read_only' : 'full')
      if (acesso !== 'full') {
        return NextResponse.json({ error: 'Sem permissao para editar contatos' }, { status: 403 })
      }
    }

    const body = await req.json()
    const validation = schema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { clientId, set = {}, remove = [] } = validation.data

    // IDOR: o contato precisa ser da empresa autenticada.
    const existente = await prisma.client.findFirst({
      where: { id: clientId, companyId },
      select: { id: true, customFields: true },
    })
    if (!existente) {
      return NextResponse.json({ error: 'Contato nao encontrado' }, { status: 404 })
    }

    const atual = (existente.customFields as Record<string, unknown> | null) || {}
    const novo: Record<string, unknown> = { ...atual }

    for (const chave of remove) {
      const k = chave.trim()
      if (k && !interna(k)) delete novo[k]
    }
    for (const [chave, valor] of Object.entries(set)) {
      const k = chave.trim()
      const v = valor.trim()
      if (!k || interna(k)) continue
      // Valor vazio remove o par, em vez de guardar string vazia.
      if (v) novo[k] = v
      else delete novo[k]
    }

    // O limite conta so o que o painel gerencia — assim um contato que ja
    // tinha muitos campos gravados por outro fluxo nao fica sem poder editar.
    const visiveis = Object.keys(novo).filter((k) => !interna(k))
    if (visiveis.length > MAX_ATRIBUTOS) {
      return NextResponse.json(
        { error: `Maximo de ${MAX_ATRIBUTOS} atributos por contato` },
        { status: 400 }
      )
    }

    const cliente = await prisma.client.update({
      where: { id: clientId },
      data: { customFields: novo as Prisma.InputJsonValue },
      select: { id: true, customFields: true },
    })

    return NextResponse.json(cliente)
  } catch (error) {
    return handleApiError(error, 'Erro ao salvar atributos do contato')
  }
}

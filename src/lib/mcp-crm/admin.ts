import { prisma } from '@/lib/db'
import { chaveTelefone } from './telefone.mjs'

/**
 * MCP do super-admin: um acesso so pra todos os restaurantes (tokens em
 * ./token.ts). Aqui ficam as buscas que atravessam restaurantes: onde um
 * telefone aparece, a lista de restaurantes, de qual restaurante e um id.
 *
 * O resto continua pela API no loopback: com o token completo no header
 * `x-mcp-admin` e o restaurante da vez em `x-impersonate-company`, o
 * authenticate() trata a chamada como a chave de API daquele restaurante. O
 * isolamento segue nas rotas de sempre; aqui so se escolhe QUAL restaurante.
 */
export interface Restaurante {
  id: string
  nome: string
}

/** Restaurante a partir de um id ja conhecido: dele mesmo, do agente ou da conversa. */
export async function restauranteDe(p: {
  restauranteId?: string
  agenteId?: string
  conversaId?: string
}): Promise<Restaurante | null> {
  const porEmpresa = (id: string) =>
    prisma.company.findUnique({ where: { id }, select: { id: true, name: true } })

  let companyId: string | null = null
  if (p.restauranteId) companyId = p.restauranteId
  else if (p.agenteId) {
    companyId = (await prisma.aiAgent.findUnique({ where: { id: p.agenteId }, select: { companyId: true } }))?.companyId ?? null
  } else if (p.conversaId) {
    companyId = (await prisma.conversation.findUnique({ where: { id: p.conversaId }, select: { companyId: true } }))?.companyId ?? null
  }
  if (!companyId) return null
  const empresa = await porEmpresa(companyId)
  return empresa ? { id: empresa.id, nome: empresa.name } : null
}

export interface OndeAparece {
  clientes: { restaurante: Restaurante; nome: string; telefone: string; ultimaConversaEm: string | null; conversas: number }[]
  conexoes: { restaurante: Restaurante; nome: string; telefone: string; status: string | null }[]
  usuarios: { restaurante: Restaurante | null; nome: string; telefone: string; papeis: string[] }[]
}

/**
 * Onde um telefone aparece, em todos os restaurantes: como cliente, como o
 * WhatsApp do restaurante ou como usuario da equipe. Mesma comparacao das
 * ferramentas (sem 55, sem o nono digito).
 */
export async function ondeApareceTelefone(telefone: string): Promise<OndeAparece> {
  const chave = chaveTelefone(telefone)
  if (chave.length < 8) return { clientes: [], conexoes: [], usuarios: [] }
  const final = chave.slice(-8)
  const bate = (t: string | null) => {
    const c = chaveTelefone(t)
    return chave.length < 10 ? c.endsWith(chave) : c === chave
  }

  const [clientes, conexoes, usuarios] = await Promise.all([
    prisma.client.findMany({
      where: { phone: { contains: final } },
      take: 50,
      select: {
        firstName: true,
        lastName: true,
        phone: true,
        company: { select: { id: true, name: true } },
        conversations: { orderBy: { updatedAt: 'desc' }, take: 1, select: { updatedAt: true } },
        _count: { select: { conversations: true } },
      },
    }),
    prisma.inbox.findMany({
      where: { phoneNumber: { contains: final } },
      take: 20,
      select: { displayName: true, instanceName: true, phoneNumber: true, status: true, company: { select: { id: true, name: true } } },
    }),
    prisma.user.findMany({
      where: { phone: { contains: final } },
      take: 20,
      select: {
        fullName: true,
        phone: true,
        company: { select: { id: true, name: true } },
        userRoles: { select: { role: true } },
      },
    }),
  ])

  return {
    clientes: clientes
      .filter((c) => bate(c.phone))
      .map((c) => ({
        restaurante: { id: c.company.id, nome: c.company.name },
        nome: [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || 'sem nome',
        telefone: c.phone ?? '',
        ultimaConversaEm: c.conversations[0]?.updatedAt.toISOString() ?? null,
        conversas: c._count.conversations,
      })),
    conexoes: conexoes
      .filter((i) => bate(i.phoneNumber))
      .map((i) => ({
        restaurante: { id: i.company.id, nome: i.company.name },
        nome: i.displayName?.trim() || i.instanceName,
        telefone: i.phoneNumber ?? '',
        status: i.status,
      })),
    usuarios: usuarios
      .filter((u) => bate(u.phone))
      .map((u) => ({
        restaurante: u.company ? { id: u.company.id, nome: u.company.name } : null,
        nome: u.fullName?.trim() || 'sem nome',
        telefone: u.phone ?? '',
        papeis: u.userRoles.map((r) => String(r.role)),
      })),
  }
}

export interface RestauranteListado extends Restaurante {
  ativo: boolean
  conexoes: { nome: string; telefone: string | null; status: string | null }[]
}

export async function listarRestaurantes(busca?: string): Promise<RestauranteListado[]> {
  const termo = busca?.trim()
  const empresas = await prisma.company.findMany({
    where: termo ? { name: { contains: termo, mode: 'insensitive' } } : {},
    orderBy: { name: 'asc' },
    take: 100,
    select: {
      id: true,
      name: true,
      isActive: true,
      inboxes: {
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { displayName: true, instanceName: true, phoneNumber: true, status: true },
      },
    },
  })
  return empresas.map((e) => ({
    id: e.id,
    nome: e.name,
    ativo: e.isActive,
    conexoes: e.inboxes.map((i) => ({ nome: i.displayName?.trim() || i.instanceName, telefone: i.phoneNumber, status: i.status })),
  }))
}

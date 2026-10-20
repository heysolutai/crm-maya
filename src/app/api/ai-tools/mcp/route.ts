import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { isCompanyAdmin } from '@/lib/api/company-admin'
import { handleApiError } from '@/lib/api/errors'
import { falhasRecentesDeFerramentas, quandoFoi } from '@/lib/ai-tools/falhas'
import { IntegrationHttpError } from '@/lib/ai-tools/http'
import { ErroRpcMcp } from '@/lib/ai-tools/mcp'
import { sincronizarMcp } from '@/lib/ai-tools/mcp-sync'
import { enabledNativeNames } from '@/lib/ai-tools/native'
import { encryptSecret } from '@/lib/ai-tools/secrets'
import { explicarFalhaFerramenta } from '@/lib/erros/ferramentas'

/**
 * Agente de IA > Ferramentas: "Function calls" ou "Servidor MCP" por WhatsApp.
 *
 * GET    ?agentId=   -> modo, conexao MCP do WhatsApp e as ferramentas dela
 * PUT    { agentId, modo?, ferramentasLigadas? } -> troca o modo / liga e desliga ferramentas
 * POST   { agentId, endereco, chave?, estilo } -> conecta (ou reconecta) e busca as ferramentas
 * DELETE ?agentId=   -> desconecta o servidor e volta pro modo function calls
 *
 * A conexao e uma Integration PRIVADA (companyId + aiAgentId), kind='mcp': o
 * resto do sistema (executor, falhas, Testar a IA) funciona igual ao catalogo.
 * Alterar: so o administrador do restaurante.
 */

const ESTILOS = {
  bearer: (chave: string) => ({ Authorization: `Bearer ${chave}` }),
  'x-api-key': (chave: string) => ({ 'x-api-key': chave }),
  apikey: (chave: string) => ({ apikey: chave }),
} as const

const putSchema = z
  .object({
    agentId: z.string().uuid(),
    modo: z.enum(['function_calls', 'mcp']).optional(),
    ferramentasLigadas: z.array(z.string().min(1).max(100)).max(200).optional(),
  })
  .refine((d) => d.modo !== undefined || d.ferramentasLigadas !== undefined, { message: 'Nada para salvar' })

const postSchema = z.object({
  agentId: z.string().uuid(),
  endereco: z.string().trim().url('Endereço inválido').max(500).refine((u) => u.startsWith('https://'), 'Use um endereço https://'),
  /** Vazia = mantem a chave ja salva. */
  chave: z.string().trim().max(4000).optional(),
  estilo: z.enum(['bearer', 'x-api-key', 'apikey']).default('bearer'),
})

async function agenteDaEmpresa(companyId: string, agentId: string) {
  return prisma.aiAgent.findFirst({ where: { id: agentId, companyId }, select: { id: true, toolMode: true } })
}

async function conexaoDoAgente(companyId: string, agentId: string) {
  return prisma.integration.findFirst({
    where: { companyId, aiAgentId: agentId, kind: 'mcp' },
    include: { tools: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
  })
}

async function estado(companyId: string, agentId: string) {
  const [agente, conexao, company] = await Promise.all([
    agenteDaEmpresa(companyId, agentId),
    conexaoDoAgente(companyId, agentId),
    prisma.company.findUnique({ where: { id: companyId }, select: { settings: true } }),
  ])
  const ci = conexao
    ? await prisma.companyIntegration.findUnique({
        where: { companyId_integrationId: { companyId, integrationId: conexao.id } },
        select: { enabled: true, enabledTools: true },
      })
    : null
  const ligadas = new Set(ci?.enabled ? ci.enabledTools : [])

  let problemaRecente: { titulo: string; motivo: string; oQueFazer: string | null; quando: string; vezes: number } | null = null
  if (conexao) {
    const grupos = await falhasRecentesDeFerramentas(companyId, {
      desde: new Date(Date.now() - 24 * 60 * 60 * 1000),
      integrationId: conexao.id,
    })
    const g = grupos[0]
    if (g) {
      problemaRecente = {
        titulo: g.explicacao.titulo,
        motivo: g.explicacao.motivo,
        oQueFazer: g.explicacao.oQueFazer,
        quando: quandoFoi(g.ultimaEm),
        vezes: g.vezes,
      }
    }
  }

  return {
    modo: agente?.toolMode === 'mcp' ? 'mcp' : 'function_calls',
    conexao: conexao
      ? {
          endereco: conexao.baseUrl,
          temChave: Object.keys((conexao.headers as Record<string, unknown>) ?? {}).length > 0,
        }
      : null,
    ferramentas: (conexao?.tools ?? [])
      .filter((t) => t.isActive)
      .map((t) => ({
        name: t.name,
        label: t.label,
        description: t.aiDescription,
        isWrite: t.isWrite,
        ligada: ligadas.has(t.name),
      })),
    transferirLigada: enabledNativeNames(company?.settings).includes('transferir_para_humano'),
    problemaRecente,
  }
}

/** Erro de conexao -> frase simples (o texto tecnico fica no log). */
function erroDeConexao(err: IntegrationHttpError | ErroRpcMcp): string {
  const status = err instanceof IntegrationHttpError ? err.status ?? null : null
  const e = explicarFalhaFerramenta({ error: err.message, httpStatus: status, sistema: 'servidor MCP' })
  const oQueFazer =
    e.codigo === 'acesso_recusado'
      ? 'Confira a chave e como ela é enviada, e conecte de novo.'
      : e.codigo === 'endereco_errado'
        ? 'Confira o endereço do servidor (precisa ser https e terminar no caminho do MCP, ex.: /mcp).'
        : e.codigo === 'fora_do_ar'
          ? 'O servidor não respondeu. Tente de novo em alguns minutos.'
          : 'Confira o endereço e a chave. Se continuar, fale com o suporte.'
  return `Não consegui conectar: ${e.titulo.replace(/^O servidor MCP/, 'o servidor')}. ${oQueFazer}`
}

async function exigirAdmin(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.companyId) return { erro: NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 }) } as const
  if (!(await isCompanyAdmin(auth))) {
    return { erro: NextResponse.json({ error: 'Só o administrador do restaurante pode mudar isso.' }, { status: 403 }) } as const
  }
  return { companyId: auth.companyId } as const
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.companyId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 })

  try {
    const agentId = z.string().uuid().safeParse(req.nextUrl.searchParams.get('agentId'))
    if (!agentId.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    if (!(await agenteDaEmpresa(auth.companyId, agentId.data))) {
      return NextResponse.json({ error: 'Agente de IA não encontrado' }, { status: 404 })
    }
    return NextResponse.json(await estado(auth.companyId, agentId.data))
  } catch (error) {
    return handleApiError(error, 'Erro ao carregar o modo de ferramentas')
  }
}

export async function PUT(req: NextRequest) {
  const acesso = await exigirAdmin(req)
  if ('erro' in acesso) return acesso.erro
  const { companyId } = acesso

  try {
    const parsed = putSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }
    const { agentId, modo, ferramentasLigadas } = parsed.data
    if (!(await agenteDaEmpresa(companyId, agentId))) {
      return NextResponse.json({ error: 'Agente de IA não encontrado' }, { status: 404 })
    }

    if (modo) await prisma.aiAgent.update({ where: { id: agentId }, data: { toolMode: modo } })

    if (ferramentasLigadas) {
      const conexao = await conexaoDoAgente(companyId, agentId)
      if (!conexao) return NextResponse.json({ error: 'Conecte o servidor MCP primeiro.' }, { status: 400 })
      const existentes = new Set(conexao.tools.filter((t) => t.isActive).map((t) => t.name))
      // IDOR: so nomes de ferramentas DESTA conexao.
      if (ferramentasLigadas.some((n) => !existentes.has(n))) {
        return NextResponse.json({ error: 'Uma das ferramentas escolhidas não existe nesta conexão.' }, { status: 400 })
      }
      await prisma.companyIntegration.upsert({
        where: { companyId_integrationId: { companyId, integrationId: conexao.id } },
        create: { companyId, integrationId: conexao.id, enabled: true, enabledTools: [...new Set(ferramentasLigadas)] },
        update: { enabled: true, enabledTools: [...new Set(ferramentasLigadas)] },
      })
    }

    return NextResponse.json(await estado(companyId, agentId))
  } catch (error) {
    return handleApiError(error, 'Erro ao salvar o modo de ferramentas')
  }
}

export async function POST(req: NextRequest) {
  const acesso = await exigirAdmin(req)
  if ('erro' in acesso) return acesso.erro
  const { companyId } = acesso

  try {
    const parsed = postSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      const campos = parsed.error.flatten().fieldErrors
      const primeiro = Object.values(campos).flat()[0]
      return NextResponse.json({ error: primeiro || 'Dados inválidos', details: campos }, { status: 400 })
    }
    const { agentId, endereco, chave, estilo } = parsed.data
    if (!(await agenteDaEmpresa(companyId, agentId))) {
      return NextResponse.json({ error: 'Agente de IA não encontrado' }, { status: 404 })
    }

    // Chave nova -> cabecalho cifrado no jeito escolhido; sem chave, mantem a salva.
    const novosCabecalhos = chave
      ? Object.fromEntries(Object.entries(ESTILOS[estilo](chave)).map(([k, v]) => [k, encryptSecret(v)]))
      : null

    let conexao = await conexaoDoAgente(companyId, agentId)
    const antes = new Set(conexao?.tools.map((t) => t.name) ?? [])
    if (conexao) {
      await prisma.integration.update({
        where: { id: conexao.id },
        data: { baseUrl: endereco, isActive: true, ...(novosCabecalhos ? { headers: novosCabecalhos } : {}) },
      })
    } else {
      await prisma.integration.create({
        data: {
          slug: `mcp-${agentId.slice(0, 8)}-${randomBytes(3).toString('hex')}`,
          name: 'Servidor MCP',
          description: 'Servidor MCP conectado pelo restaurante.',
          kind: 'mcp',
          companyId,
          aiAgentId: agentId,
          baseUrl: endereco,
          headers: novosCabecalhos ?? {},
          configFields: [],
          isActive: true,
        },
      })
    }
    conexao = await conexaoDoAgente(companyId, agentId)
    if (!conexao) throw new Error('conexao MCP nao gravada')

    try {
      await sincronizarMcp(conexao.id)
    } catch (err) {
      if (err instanceof IntegrationHttpError || err instanceof ErroRpcMcp) {
        console.error('[ai-tools/mcp] falha ao conectar', conexao.id, err.message)
        return NextResponse.json({ error: erroDeConexao(err) }, { status: 502 })
      }
      throw err
    }

    // Liga: o que ja estava ligado continua; ferramenta nova do servidor ja vem ligada.
    const depois = await prisma.integrationTool.findMany({
      where: { integrationId: conexao.id, isActive: true },
      select: { name: true },
    })
    const ci = await prisma.companyIntegration.findUnique({
      where: { companyId_integrationId: { companyId, integrationId: conexao.id } },
      select: { enabledTools: true },
    })
    const ativas = new Set(depois.map((t) => t.name))
    const ligadas = new Set((ci?.enabledTools ?? []).filter((n) => ativas.has(n)))
    for (const t of depois) if (!antes.has(t.name)) ligadas.add(t.name)
    await prisma.companyIntegration.upsert({
      where: { companyId_integrationId: { companyId, integrationId: conexao.id } },
      create: { companyId, integrationId: conexao.id, enabled: true, enabledTools: [...ligadas] },
      update: { enabled: true, enabledTools: [...ligadas] },
    })
    await prisma.aiAgent.update({ where: { id: agentId }, data: { toolMode: 'mcp' } })

    return NextResponse.json(await estado(companyId, agentId))
  } catch (error) {
    return handleApiError(error, 'Erro ao conectar o servidor MCP')
  }
}

export async function DELETE(req: NextRequest) {
  const acesso = await exigirAdmin(req)
  if ('erro' in acesso) return acesso.erro
  const { companyId } = acesso

  try {
    const agentId = z.string().uuid().safeParse(req.nextUrl.searchParams.get('agentId'))
    if (!agentId.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    if (!(await agenteDaEmpresa(companyId, agentId.data))) {
      return NextResponse.json({ error: 'Agente de IA não encontrado' }, { status: 404 })
    }
    // Apaga a conexao (ferramentas e escolhas vao junto, em cascata) e volta pro function calls.
    await prisma.integration.deleteMany({ where: { companyId, aiAgentId: agentId.data, kind: 'mcp' } })
    await prisma.aiAgent.update({ where: { id: agentId.data }, data: { toolMode: 'function_calls' } })
    return NextResponse.json(await estado(companyId, agentId.data))
  } catch (error) {
    return handleApiError(error, 'Erro ao desconectar o servidor MCP')
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { buildPromptCompleto, normalizeSimpleForm } from '@/lib/agentSimpleConfig'
import { consolidatePrompt } from '@/lib/promptConsolidation'
import { historicoComTroca, lerHistorico, marcaDoPrompt, MAX_VERSOES } from '@/lib/promptHistorico'

/**
 * Prompt do agente de IA para o MCP do CRM (auditoria + ajuste).
 *
 * GET              lista os agentes, com as conexoes que cada um atende.
 * GET ?id=         prompt atual, marca de versao e historico de trocas.
 *     &anterior=N  inclui o texto da versao anterior N (1 = a mais recente).
 * PATCH            troca o prompt. Exige a `versao` lida (se o texto mudou
 *                  no meio, recusa em vez de sobrescrever) e um motivo; o
 *                  texto que valia vai pro historico, pra poder voltar.
 *
 * Nunca devolve as chaves de API do agente (o GET de /api/ai-configurations
 * por x-api-key devolve, por causa do n8n).
 */

/** O editor da tela recusa menos que isso: um prompt quase vazio e acidente. */
const MIN_PROMPT = 50
const MAX_PROMPT = 60_000

const patchSchema = z
  .object({
    id: z.string().uuid(),
    versao: z.string().trim().min(6).max(64),
    motivo: z.string().trim().min(3).max(300),
    trocar: z.string().min(1).max(MAX_PROMPT).optional(),
    por: z.string().max(MAX_PROMPT).optional(),
    prompt_novo: z.string().max(MAX_PROMPT).optional(),
    restaurar: z.number().int().min(1).max(MAX_VERSOES).optional(),
  })
  .refine(
    (d) => [d.trocar !== undefined, d.prompt_novo !== undefined, d.restaurar !== undefined].filter(Boolean).length === 1,
    { message: 'Use um modo so: trocar+por, prompt_novo ou restaurar' }
  )
  .refine((d) => d.trocar === undefined || d.por !== undefined, { message: '"trocar" precisa de "por"' })

const selectAgente = (companyId: string) =>
  ({
    id: true,
    name: true,
    isActive: true,
    engine: true,
    prompts: true,
    inboxes: {
      where: { companyId, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, displayName: true, instanceName: true },
    },
  }) satisfies Prisma.AiAgentSelect

type AgenteLido = Prisma.AiAgentGetPayload<{ select: ReturnType<typeof selectAgente> }>

function comoRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/** O texto atual e exatamente o que o formulario do modo simples gera? */
function geradoPeloModoSimples(prompts: Record<string, unknown>, atual: string): boolean {
  const simple = prompts.simple
  if (!simple || typeof simple !== 'object') return false
  return buildPromptCompleto(normalizeSimpleForm(simple)).trim() === atual.trim()
}

function resumo(a: AgenteLido) {
  const prompts = comoRecord(a.prompts)
  const atual = consolidatePrompt(prompts)
  const historico = lerHistorico(prompts)
  return {
    id: a.id,
    nome: a.name || 'Agente sem nome',
    ativo: a.isActive,
    motor: a.engine,
    conexoes: a.inboxes.map((i) => ({ id: i.id, nome: i.displayName?.trim() || i.instanceName })),
    tamanho: atual.length,
    versao: marcaDoPrompt(atual),
    /** Desde quando o texto atual vale (null: sem troca registrada). */
    valeDesde: historico[0]?.trocadoEm ?? null,
    modoSimples: geradoPeloModoSimples(prompts, atual),
    versoesAnteriores: historico.length,
  }
}

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })

    const id = req.nextUrl.searchParams.get('id')
    if (!id) {
      const agentes = await prisma.aiAgent.findMany({
        where: { companyId },
        orderBy: { createdAt: 'asc' },
        select: selectAgente(companyId),
      })
      return NextResponse.json({ data: agentes.map(resumo) })
    }

    const parsed = z
      .object({ id: z.string().uuid(), anterior: z.coerce.number().int().min(1).max(MAX_VERSOES).optional() })
      .safeParse({ id, anterior: req.nextUrl.searchParams.get('anterior') ?? undefined })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    // IDOR: o agente precisa ser do restaurante.
    const agente = await prisma.aiAgent.findFirst({
      where: { id: parsed.data.id, companyId },
      select: selectAgente(companyId),
    })
    if (!agente) return NextResponse.json({ error: 'Agente nao encontrado' }, { status: 404 })

    const prompts = comoRecord(agente.prompts)
    const historico = lerHistorico(prompts)
    const n = parsed.data.anterior
    if (n && !historico[n - 1]) {
      return NextResponse.json(
        { error: `Nao existe a versao anterior ${n}: este agente tem ${historico.length}.` },
        { status: 404 }
      )
    }

    return NextResponse.json({
      ...resumo(agente),
      prompt: consolidatePrompt(prompts),
      historico: historico.map((v, i) => ({
        numero: i + 1,
        trocadoEm: v.trocadoEm,
        // Valia a partir da troca seguinte (a mais antiga nao tem registro).
        valiaDesde: historico[i + 1]?.trocadoEm ?? null,
        origem: v.origem,
        motivo: v.motivo ?? null,
        tamanho: v.prompt.length,
      })),
      ...(n ? { anterior: { numero: n, prompt: historico[n - 1].prompt } } : {}),
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao buscar prompt do agente')
  }
}

/** Posicoes onde `trecho` aparece em `texto` (sem regex: o trecho e literal). */
function ocorrencias(texto: string, trecho: string): number[] {
  const achados: number[] = []
  for (let i = texto.indexOf(trecho); i >= 0; i = texto.indexOf(trecho, i + trecho.length)) achados.push(i)
  return achados
}

export async function PATCH(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })

    const parsed = patchSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      const problemas = parsed.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
      return NextResponse.json({ error: `Dados invalidos. ${problemas.join(' | ')}` }, { status: 400 })
    }
    const d = parsed.data

    // IDOR: o agente precisa ser do restaurante.
    const agente = await prisma.aiAgent.findFirst({
      where: { id: d.id, companyId },
      select: { id: true, prompts: true },
    })
    if (!agente) return NextResponse.json({ error: 'Agente nao encontrado' }, { status: 404 })

    const prompts = comoRecord(agente.prompts)
    const atual = consolidatePrompt(prompts)
    if (marcaDoPrompt(atual) !== d.versao) {
      return NextResponse.json(
        { error: 'O prompt mudou depois da sua leitura. Leia de novo e refaca a alteracao em cima do texto atual.' },
        { status: 409 }
      )
    }

    let novo: string
    if (d.trocar !== undefined) {
      const achados = ocorrencias(atual, d.trocar)
      if (achados.length === 0) {
        return NextResponse.json({ error: 'O trecho de "trocar" nao aparece no prompt atual (precisa ser identico, com espacos e quebras de linha).' }, { status: 400 })
      }
      if (achados.length > 1) {
        return NextResponse.json({ error: `O trecho de "trocar" aparece ${achados.length} vezes. Inclua mais texto em volta pra ele ficar unico.` }, { status: 400 })
      }
      novo = atual.slice(0, achados[0]) + (d.por ?? '') + atual.slice(achados[0] + d.trocar.length)
    } else if (d.restaurar !== undefined) {
      const versao = lerHistorico(prompts)[d.restaurar - 1]
      if (!versao) return NextResponse.json({ error: `Nao existe a versao anterior ${d.restaurar}.` }, { status: 404 })
      novo = versao.prompt
    } else {
      novo = d.prompt_novo ?? ''
    }

    if (novo.trim().length < MIN_PROMPT) {
      return NextResponse.json({ error: `O prompt ficaria com menos de ${MIN_PROMPT} caracteres. Nada foi alterado.` }, { status: 400 })
    }
    if (novo.length > MAX_PROMPT) {
      return NextResponse.json({ error: `O prompt passaria de ${MAX_PROMPT} caracteres. Nada foi alterado.` }, { status: 400 })
    }
    if (novo.trim() === atual.trim()) {
      return NextResponse.json({ error: 'O texto novo e igual ao atual. Nada foi alterado.' }, { status: 400 })
    }

    const agora = new Date()
    const historico = historicoComTroca(prompts, novo, 'mcp', d.motivo, agora)
    // So grava se os prompts ainda sao os lidos: uma troca pela tela entre a
    // leitura e aqui perderia o texto dela.
    const gravados = await prisma.aiAgent.updateMany({
      where: {
        id: agente.id,
        companyId,
        prompts: { equals: agente.prompts === null ? Prisma.DbNull : (agente.prompts as Prisma.InputJsonValue) },
      },
      data: { prompts: { ...prompts, prompt_completo: novo, historico } as unknown as Prisma.InputJsonValue },
    })
    if (gravados.count === 0) {
      return NextResponse.json(
        { error: 'O prompt mudou enquanto a alteracao era gravada. Leia de novo e refaca.' },
        { status: 409 }
      )
    }

    return NextResponse.json({
      id: agente.id,
      versao: marcaDoPrompt(novo),
      tamanhoAntes: atual.length,
      tamanhoDepois: novo.length,
      trocadoEm: agora.toISOString(),
      versoesAnteriores: historico.length,
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao alterar prompt do agente')
  }
}

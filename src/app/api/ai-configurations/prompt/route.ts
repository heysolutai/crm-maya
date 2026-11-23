import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import {
  buildPromptCompleto,
  CAMPOS_MCP,
  CAMPOS_TEXTO,
  normalizeSimpleForm,
  TONES,
  VERBOSITY,
  type CampoEditavel,
  type SimpleForm,
} from '@/lib/agentSimpleConfig'
import { idDoReserveMaya, PERFIS, type PerfilAgente } from '@/lib/agentProfile'
import { consolidatePrompt } from '@/lib/promptConsolidation'
import { historicoComTroca, lerHistorico, marcaDoPrompt, MAX_VERSOES } from '@/lib/promptHistorico'
import { modoDoPrompt, type ModoPrompt } from '@/lib/promptModo'
import { numerosDoTeste } from '@/lib/ai/so-um-numero'
import { buildCapabilitiesPrompt, listCompanyTools } from '@/lib/ai-tools/registry'
import { lerConfigMaestro } from '@/lib/maestro/config'
import { montarPartesDoPrompt } from '@/lib/maestro/prompt'

/**
 * Prompt do agente de IA para o MCP do CRM (auditoria + ajuste).
 *
 * GET              lista os agentes, com as conexoes, o modo e o tipo de cada um.
 * GET ?id=         prompt atual, modo em uso, campos do modo simples (com para
 *                  que serve e limite), marca de versao e historico de trocas.
 *     &anterior=N  inclui o texto da versao anterior N (1 = a mais recente).
 *     &partes=1    inclui as 4 partes que a IA recebe (como "Ver o que a IA recebe").
 * PATCH            troca o prompt, SEMPRE no formato do modo em uso:
 *                    modo simples  -> `campos` (o texto e gerado de novo);
 *                    modo avancado -> `trocar`+`por` ou `prompt_novo`;
 *                    `restaurar`   -> volta uma versao sem mudar o modo.
 *                  Modo se escolhe so na plataforma: alteracao que trocaria o
 *                  modo e recusada. Exige a `versao` lida (se o texto mudou no
 *                  meio, recusa em vez de sobrescrever) e um motivo; o texto que
 *                  valia vai pro historico. `simular: true` devolve o antes e o
 *                  depois sem gravar.
 *
 * Nunca devolve as chaves de API do agente (o GET de /api/ai-configurations
 * por x-api-key devolve, por causa do n8n).
 */

/** O editor da tela recusa menos que isso: um prompt quase vazio e acidente. */
const MIN_PROMPT = 50
const MAX_PROMPT = 60_000

/** Campos do modo simples pelo nome do MCP, com os mesmos limites da tela. */
function schemaDosCampos() {
  const formato: Record<string, z.ZodTypeAny> = {}
  for (const { nome, campo } of CAMPOS_MCP) {
    if (campo === 'tone') formato[nome] = z.enum(TONES.map((t) => t.value) as [string, ...string[]]).optional()
    else if (campo === 'verbosity') formato[nome] = z.enum(VERBOSITY.map((v) => v.value) as [string, ...string[]]).optional()
    else {
      const info = CAMPOS_TEXTO[campo]
      formato[nome] = z.string().max(info.max, `${info.rotulo}: no máximo ${info.max} caracteres`).optional()
    }
  }
  return z
    .object(formato)
    .strict()
    .refine((o) => Object.values(o).some((v) => v !== undefined), { message: 'Informe ao menos um campo' })
}

const patchSchema = z
  .object({
    id: z.string().uuid(),
    versao: z.string().trim().min(6).max(64),
    motivo: z.string().trim().min(3).max(300),
    trocar: z.string().min(1).max(MAX_PROMPT).optional(),
    por: z.string().max(MAX_PROMPT).optional(),
    prompt_novo: z.string().max(MAX_PROMPT).optional(),
    restaurar: z.number().int().min(1).max(MAX_VERSOES).optional(),
    campos: schemaDosCampos().optional(),
    simular: z.boolean().optional(),
  })
  .refine(
    (d) =>
      [d.trocar !== undefined, d.prompt_novo !== undefined, d.restaurar !== undefined, d.campos !== undefined].filter(Boolean)
        .length === 1,
    { message: 'Use um modo so: campos, trocar+por, prompt_novo ou restaurar' }
  )
  .refine((d) => d.trocar === undefined || d.por !== undefined, { message: '"trocar" precisa de "por"' })

const selectAgente = (companyId: string) =>
  ({
    id: true,
    name: true,
    isActive: true,
    onlyPhone: true,
    engine: true,
    prompts: true,
    behaviorSettings: true,
    inboxes: {
      where: { companyId, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, displayName: true, instanceName: true, phoneNumber: true, channelConfig: true },
    },
  }) satisfies Prisma.AiAgentSelect

type AgenteLido = Prisma.AiAgentGetPayload<{ select: ReturnType<typeof selectAgente> }>

function comoRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/** Tipo do agente: alguma conexao dele tem o ID do Reserve Maya (igual a tela). */
function tipoDe(a: AgenteLido): PerfilAgente {
  return a.inboxes.some((i) => idDoReserveMaya(i.channelConfig)) ? 'reserve_maya' : 'personalizado'
}

function resumo(a: AgenteLido) {
  const prompts = comoRecord(a.prompts)
  const atual = consolidatePrompt(prompts)
  const historico = lerHistorico(prompts)
  const modo = modoDoPrompt(prompts)
  return {
    id: a.id,
    nome: a.name || 'Agente sem nome',
    ativo: a.isActive,
    /** IA ligada so para estes numeros (teste). Vazio = para todos. */
    numerosDeTeste: numerosDoTeste(a.onlyPhone),
    motor: a.engine,
    tipo: tipoDe(a),
    modo,
    conexoes: a.inboxes.map((i) => ({
      id: i.id,
      nome: i.displayName?.trim() || i.instanceName,
      telefone: i.phoneNumber,
      idReserveMaya: idDoReserveMaya(i.channelConfig),
    })),
    tamanho: atual.length,
    versao: marcaDoPrompt(atual),
    /** Desde quando o texto atual vale (null: sem troca registrada). */
    valeDesde: historico[0]?.trocadoEm ?? null,
    /** Mantido por compatibilidade (MCP antigo): o mesmo que modo === 'simples'. */
    modoSimples: modo === 'simples',
    versoesAnteriores: historico.length,
  }
}

/** Rotulo, explicacao, limite e opcoes de um campo, pelo nome do MCP. */
function infoDoCampo(campo: CampoEditavel) {
  if (campo === 'tone') {
    return {
      rotulo: 'Tom de voz',
      paraQueServe: 'O jeito de falar da IA.',
      opcoes: TONES.map((t) => ({ valor: t.value, rotulo: t.label, descricao: t.hint })),
    }
  }
  if (campo === 'verbosity') {
    return {
      rotulo: 'Como a IA responde',
      paraQueServe: 'O tamanho das respostas.',
      opcoes: VERBOSITY.map((v) => ({ valor: v.value, rotulo: v.label, descricao: v.hint })),
    }
  }
  const info = CAMPOS_TEXTO[campo]
  return { rotulo: info.rotulo, paraQueServe: info.paraQueServe, max: info.max, exemplo: info.exemplo }
}

/**
 * De onde a IA tira o dado do campo:
 *   reserve_maya         -> so do sistema de reservas (campo bloqueado);
 *   reserve_maya_primeiro -> do sistema de reservas se la tiver; senao, deste campo;
 *   prompt               -> deste campo.
 */
type FonteDoCampo = 'reserve_maya' | 'reserve_maya_primeiro' | 'prompt'

function fonteDoCampo(campo: CampoEditavel, tipo: PerfilAgente): FonteDoCampo {
  if (tipo !== 'reserve_maya' || campo === 'tone' || campo === 'verbosity') return 'prompt'
  const info = CAMPOS_TEXTO[campo]
  if (info.vemDoReserveMaya) return 'reserve_maya'
  if (info.reserveMayaPrimeiro) return 'reserve_maya_primeiro'
  return 'prompt'
}

function camposDoAgente(prompts: Record<string, unknown>, tipo: PerfilAgente) {
  const form = normalizeSimpleForm(prompts.simple)
  return CAMPOS_MCP.map(({ nome, campo }) => {
    const fonte = fonteDoCampo(campo, tipo)
    const nota =
      tipo === 'reserve_maya' && campo !== 'tone' && campo !== 'verbosity' ? CAMPOS_TEXTO[campo].notaReserveMaya ?? null : null
    return {
      nome,
      ...infoDoCampo(campo),
      valor: form[campo],
      fonte,
      /** Observacao para restaurante Reserve Maya (ex.: precos ficam aqui; eventos especiais vem de la). */
      nota,
      /** Restaurante Reserve Maya: o dado vem do sistema de reservas e o campo nao se preenche. */
      bloqueado: fonte === 'reserve_maya',
    }
  })
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
      .object({
        id: z.string().uuid(),
        anterior: z.coerce.number().int().min(1).max(MAX_VERSOES).optional(),
        partes: z.enum(['1']).optional(),
      })
      .safeParse({
        id,
        anterior: req.nextUrl.searchParams.get('anterior') ?? undefined,
        partes: req.nextUrl.searchParams.get('partes') ?? undefined,
      })
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

    const tipo = tipoDe(agente)
    const config = lerConfigMaestro(agente)

    // "Ver o que a IA recebe": as mesmas 4 partes da tela (exemplo de primeira resposta).
    let partes: ReturnType<typeof montarPartesDoPrompt> | null = null
    if (parsed.data.partes) {
      const [empresa, tools] = await Promise.all([
        prisma.company.findFirst({ where: { id: companyId }, select: { name: true, tradeName: true } }),
        listCompanyTools(companyId, { agentId: agente.id }),
      ])
      partes = montarPartesDoPrompt({
        config,
        empresaNome: empresa?.tradeName || empresa?.name || '',
        clienteNome: 'Cliente',
        codigoConversa: null,
        capacidades: buildCapabilitiesPrompt(tools),
        primeiraResposta: true,
      })
    }

    return NextResponse.json({
      ...resumo(agente),
      tipoExplicado: PERFIS[tipo].hint,
      modelo: config.modelo,
      temperatura: config.temperatura,
      prompt: consolidatePrompt(prompts),
      campos: camposDoAgente(prompts, tipo),
      historico: historico.map((v, i) => ({
        numero: i + 1,
        trocadoEm: v.trocadoEm,
        // Valia a partir da troca seguinte (a mais antiga nao tem registro).
        valiaDesde: historico[i + 1]?.trocadoEm ?? null,
        origem: v.origem,
        motivo: v.motivo ?? null,
        tamanho: v.prompt.length,
        /** A versao foi gerada pelo modo simples (voltar para ela restaura os campos). */
        doModoSimples: !!v.simple,
      })),
      ...(n ? { anterior: { numero: n, prompt: historico[n - 1].prompt } } : {}),
      ...(partes ? { partes } : {}),
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

const SEM_MODO =
  'Este agente ainda não tem prompt salvo. O modo (simples ou avançado) é escolhido só na plataforma: salve uma vez pela aba Prompt e depois altere por aqui.'

/** Por que o formato pedido nao vale no modo em uso (null = vale). */
function formatoRecusado(modo: ModoPrompt, pedido: 'campos' | 'texto'): string | null {
  if (modo === 'nenhum') return SEM_MODO
  if (pedido === 'campos' && modo === 'avancado') {
    return 'Este agente está no modo avançado (texto livre): altere o texto com alterar_prompt. Trocar para o modo simples só pela plataforma.'
  }
  if (pedido === 'texto' && modo === 'simples') {
    return 'Este agente está no modo simples: altere pelos campos (alterar_campos). Editar o texto direto tiraria o agente do modo simples; trocar de modo só pela plataforma.'
  }
  return null
}

interface Mudanca {
  campo: string
  rotulo: string
  antes: string
  depois: string
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
      select: selectAgente(companyId),
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
    const modo = modoDoPrompt(prompts)

    let novo: string
    /** Formulario novo do modo simples (so quando a alteracao mexe nos campos). */
    let novoSimple: SimpleForm | null = null
    const mudancas: Mudanca[] = []

    if (d.campos !== undefined) {
      const recusa = formatoRecusado(modo, 'campos')
      if (recusa) return NextResponse.json({ error: recusa }, { status: 409 })

      const tipo = tipoDe(agente)
      const antes = normalizeSimpleForm(prompts.simple)
      const depois: SimpleForm = { ...antes }
      for (const { nome, campo } of CAMPOS_MCP) {
        const valor = (d.campos as Record<string, string | undefined>)[nome]
        if (valor === undefined) continue
        if (fonteDoCampo(campo, tipo) === 'reserve_maya' && valor.trim()) {
          return NextResponse.json(
            {
              error: `${infoDoCampo(campo).rotulo}: este restaurante usa o Reserve Maya, e esse dado vem de lá em tempo real. Deixe o campo em branco (pode mandar "" para limpar).`,
            },
            { status: 400 }
          )
        }
        depois[campo] = valor
        if (valor !== antes[campo]) {
          mudancas.push({ campo: nome, rotulo: infoDoCampo(campo).rotulo, antes: antes[campo], depois: valor })
        }
      }
      if (mudancas.length === 0) {
        return NextResponse.json({ error: 'Os valores enviados são iguais aos atuais. Nada foi alterado.' }, { status: 400 })
      }
      novoSimple = depois
      novo = buildPromptCompleto(depois)
    } else if (d.restaurar !== undefined) {
      if (modo === 'nenhum') return NextResponse.json({ error: SEM_MODO }, { status: 409 })
      const versao = lerHistorico(prompts)[d.restaurar - 1]
      if (!versao) return NextResponse.json({ error: `Nao existe a versao anterior ${d.restaurar}.` }, { status: 404 })
      if (modo === 'simples') {
        // Volta os campos junto: o agente continua no modo simples.
        if (!versao.simple) {
          return NextResponse.json(
            {
              error: `A versão anterior ${d.restaurar} foi escrita como texto livre (modo avançado). Voltar para ela tiraria o agente do modo simples: se for isso mesmo, faça pela plataforma.`,
            },
            { status: 409 }
          )
        }
        novoSimple = normalizeSimpleForm(versao.simple)
        novo = buildPromptCompleto(novoSimple)
      } else {
        novo = versao.prompt
        if (modoDoPrompt({ ...prompts, prompt_completo: novo }) !== 'avancado') {
          return NextResponse.json(
            {
              error: `A versão anterior ${d.restaurar} é a do formulário do modo simples. Voltar para ela trocaria o modo do agente: se for isso mesmo, faça pela plataforma.`,
            },
            { status: 409 }
          )
        }
      }
    } else {
      const recusa = formatoRecusado(modo, 'texto')
      if (recusa) return NextResponse.json({ error: recusa }, { status: 409 })
      if (d.trocar !== undefined) {
        const achados = ocorrencias(atual, d.trocar)
        if (achados.length === 0) {
          return NextResponse.json({ error: 'O trecho de "trocar" nao aparece no prompt atual (precisa ser identico, com espacos e quebras de linha).' }, { status: 400 })
        }
        if (achados.length > 1) {
          return NextResponse.json({ error: `O trecho de "trocar" aparece ${achados.length} vezes. Inclua mais texto em volta pra ele ficar unico.` }, { status: 400 })
        }
        novo = atual.slice(0, achados[0]) + (d.por ?? '') + atual.slice(achados[0] + d.trocar.length)
      } else {
        novo = d.prompt_novo ?? ''
      }
      // Coincidencia rara: o texto novo e exatamente o do formulario gravado.
      if (modoDoPrompt({ ...prompts, prompt_completo: novo }) !== 'avancado') {
        return NextResponse.json(
          { error: 'Esse texto é exatamente o gerado pelo modo simples: gravar trocaria o modo do agente. Trocar de modo só pela plataforma.' },
          { status: 409 }
        )
      }
    }

    if (novo.trim().length < MIN_PROMPT) {
      return NextResponse.json({ error: `O prompt ficaria com menos de ${MIN_PROMPT} caracteres. Nada foi alterado.` }, { status: 400 })
    }
    if (novo.length > MAX_PROMPT) {
      return NextResponse.json({ error: `O prompt passaria de ${MAX_PROMPT} caracteres. Nada foi alterado.` }, { status: 400 })
    }
    if (novo.trim() === atual.trim() && !novoSimple) {
      return NextResponse.json({ error: 'O texto novo e igual ao atual. Nada foi alterado.' }, { status: 400 })
    }

    if (d.simular) {
      return NextResponse.json({
        simulado: true,
        id: agente.id,
        modo,
        versao: d.versao,
        tamanhoAntes: atual.length,
        tamanhoDepois: novo.length,
        mudancas,
        promptNovo: novo,
      })
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
      data: {
        prompts: {
          ...prompts,
          ...(novoSimple ? { simple: novoSimple } : {}),
          prompt_completo: novo,
          historico,
        } as unknown as Prisma.InputJsonValue,
      },
    })
    if (gravados.count === 0) {
      return NextResponse.json(
        { error: 'O prompt mudou enquanto a alteracao era gravada. Leia de novo e refaca.' },
        { status: 409 }
      )
    }

    return NextResponse.json({
      id: agente.id,
      modo,
      versao: marcaDoPrompt(novo),
      tamanhoAntes: atual.length,
      tamanhoDepois: novo.length,
      mudancas,
      trocadoEm: agora.toISOString(),
      versoesAnteriores: historico.length,
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao alterar prompt do agente')
  }
}

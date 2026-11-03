import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { publishEvent } from '@/lib/realtime'
import { buildConversationContext, buildTestContext, rotuloVariavel } from './context'
import { callIntegration, IntegrationHttpError } from './http'
import { ErroRpcMcp, mcpChamarFerramenta } from './mcp'
import { validateArgs } from './params'
import { runPostActions } from './post-actions'
import { resolverAgenteDaConversa } from '@/lib/maestro/agente'
import { cabeNoModo, resolveCompanyTool, type ResolvedTool } from './registry'
import { decryptConfig, decryptHeaders } from './secrets'
import { renderText, renderValue, type TemplateVars } from './template'
import type { ExecuteResult, ToolContext } from './types'

/**
 * Executa uma ferramenta pedida pela IA.
 *
 * Sempre devolve texto pra IA, inclusive no erro (com instrucao do que fazer):
 * ferramenta que volta vazia faz a IA inventar ("sua reserva foi feita!").
 */

const REPETICAO_MS = 2 * 60 * 1000

function parseArgs(raw: unknown): unknown {
  // OpenAI manda `arguments` como string JSON.
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return {}
    }
  }
  return raw ?? {}
}

function falhaExterna(nomeSistema: string): string {
  return `Não consegui acessar o sistema de ${nomeSistema} agora. Peça desculpas ao cliente e ofereça transferir para um atendente. Não diga que a ação foi feita.`
}

function mensagemDeRecusa(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (d.success !== false && d.ok !== false) return null
  const msg = [d.message, d.error, d.erro, d.ai_instruction].find((v) => typeof v === 'string' && v.trim())
  return typeof msg === 'string' ? msg : 'pedido recusado'
}

async function runIntegration(
  tool: ResolvedTool,
  ctx: ToolContext,
  args: Record<string, string | number | boolean>,
  aplicarAcoes: boolean
): Promise<ExecuteResult & { avisos?: string[] }> {
  const integ = tool.integration!
  const http = tool.http!
  const vars: TemplateVars = {
    args,
    config: ctx.config,
    cliente: ctx.cliente,
    conversa: ctx.conversa,
    empresa: ctx.empresa,
    inbox: ctx.inbox,
    agora: ctx.agora,
  }

  // Variaveis do CRM que ficaram vazias = integracao mal configurada (ex:
  // caixa sem ID do restaurante). Argumento opcional vazio e normal.
  const faltando = new Set<string>()
  const path = renderText(http.path || '', vars, faltando)
  if (/^[a-z]+:/i.test(path)) {
    return { ok: false, result: falhaExterna(integ.name), error: 'path absoluto nao permitido' }
  }
  const url = `${integ.baseUrl.replace(/\/+$/, '')}${path && !path.startsWith('/') ? '/' : ''}${path}`
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(decryptHeaders(integ.headers))) headers[k] = renderText(v, vars, faltando)
  const body = http.bodyTemplate !== null && http.bodyTemplate !== undefined ? renderValue(http.bodyTemplate, vars, faltando) : undefined

  const doCrm = [...faltando].filter((p) => !p.startsWith('args.'))
  if (doCrm.length) {
    return {
      ok: false,
      result: `A integração com ${integ.name} não está configurada por completo. Peça desculpas e ofereça transferir para um atendente.`,
      error: `configuracao incompleta: ${doCrm.map(rotuloVariavel).join(', ')}`,
    }
  }

  try {
    const res = await callIntegration({ method: http.method, url, headers, body })
    const respVars: TemplateVars = { ...vars, resposta: res.data }

    const recusa = mensagemDeRecusa(res.data)
    if (recusa) {
      return {
        ok: false,
        httpStatus: res.status,
        result: `O sistema de ${integ.name} recusou: ${recusa}. Explique ao cliente e ofereça uma alternativa ou transferir para um atendente.`,
        error: `recusado: ${recusa}`.slice(0, 1000),
      }
    }

    let texto = http.responseTemplate ? renderText(http.responseTemplate, respVars).trim() : ''
    if (!texto) texto = JSON.stringify(res.data).slice(0, 3000)

    const avisos = aplicarAcoes ? await runPostActions(http.postActions, ctx, respVars) : []
    return { ok: true, httpStatus: res.status, result: texto, avisos }
  } catch (err) {
    if (err instanceof IntegrationHttpError) {
      return {
        ok: false,
        httpStatus: err.status,
        result: falhaExterna(integ.name),
        error: `${err.message}${err.body ? ` | ${err.body}` : ''}`.slice(0, 2000),
      }
    }
    throw err
  }
}

/**
 * Argumentos de ferramenta MCP: o schema e do servidor (pode ter objeto,
 * lista...). Aqui so confere os obrigatorios; o resto o servidor valida.
 */
function validarArgsMcp(
  schema: Record<string, unknown>,
  raw: unknown
): { ok: true; args: Record<string, unknown> } | { ok: false; problems: string[] } {
  const args = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const obrigatorios = Array.isArray(schema.required) ? schema.required.filter((k): k is string => typeof k === 'string') : []
  const faltando = obrigatorios.filter((k) => args[k] === undefined || args[k] === null || args[k] === '')
  return faltando.length ? { ok: false, problems: faltando.map((k) => `${k} obrigatório`) } : { ok: true, args }
}

/**
 * Cabecalhos que o CRM manda sozinho pro servidor MCP: o MCP da Maya sabe por
 * eles de qual cliente e de qual restaurante e o pedido. Vem da conversa,
 * nunca da IA. Telefone no formato +55DDDNUMERO. Cabecalho com o mesmo nome
 * cadastrado na integracao vale mais.
 */
function cabecalhosDaConversa(ctx: ToolContext): Record<string, string> {
  const out: Record<string, string> = {}
  const tel = ctx.cliente.telefone
  if (tel) out['X-Maya-Customer-Phone'] = tel.length >= 12 ? `+${tel}` : tel
  if (ctx.inbox.restaurant_id) out['X-Maya-Restaurant-Id'] = ctx.inbox.restaurant_id
  return out
}

/** Ferramenta de servidor MCP (tools/call). Mesmo contrato de runIntegration. */
async function runMcp(tool: ResolvedTool, ctx: ToolContext, args: Record<string, unknown>): Promise<ExecuteResult> {
  const integ = tool.integration!
  const vars: TemplateVars = {
    config: ctx.config,
    cliente: ctx.cliente,
    conversa: ctx.conversa,
    empresa: ctx.empresa,
    inbox: ctx.inbox,
    agora: ctx.agora,
  }
  const faltando = new Set<string>()
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(decryptHeaders(integ.headers))) headers[k] = renderText(v, vars, faltando)
  if (faltando.size) {
    return {
      ok: false,
      result: `A integração com ${integ.name} não está configurada por completo. Peça desculpas e ofereça transferir para um atendente.`,
      error: `configuracao incompleta: ${[...faltando].map(rotuloVariavel).join(', ')}`,
    }
  }
  const cadastrados = new Set(Object.keys(headers).map((k) => k.toLowerCase()))
  for (const [k, v] of Object.entries(cabecalhosDaConversa(ctx))) {
    if (!cadastrados.has(k.toLowerCase())) headers[k] = v
  }

  try {
    const r = await mcpChamarFerramenta(integ.baseUrl, headers, tool.mcp!.toolName, args)
    if (r.isError) {
      const motivo = r.texto || 'pedido recusado'
      return {
        ok: false,
        result: `O sistema de ${integ.name} recusou: ${motivo.slice(0, 300)}. Explique ao cliente e ofereça uma alternativa ou transferir para um atendente.`,
        error: `recusado: ${motivo}`.slice(0, 1000),
      }
    }
    return { ok: true, result: r.texto || '(o sistema não devolveu conteúdo)' }
  } catch (err) {
    if (err instanceof ErroRpcMcp) {
      // -32602: argumento errado (a IA corrige com o cliente); -32601: ferramenta nao existe mais.
      if (err.codigo === -32602) {
        return {
          ok: false,
          result: `Não executei "${tool.label}": ${err.message}. Pergunte ao cliente o que falta (ou corrija o formato) e tente de novo.`,
          error: `argumentos invalidos: ${err.message}`.slice(0, 1000),
        }
      }
      if (err.codigo === -32601) {
        return {
          ok: false,
          result: `A ferramenta "${tool.label}" não está disponível. Siga sem ela ou ofereça transferir para um atendente.`,
          error: 'ferramenta inexistente ou desligada (servidor MCP)',
        }
      }
      return { ok: false, result: falhaExterna(integ.name), error: `MCP ${err.codigo}: ${err.message}`.slice(0, 1000) }
    }
    if (err instanceof IntegrationHttpError) {
      return {
        ok: false,
        httpStatus: err.status,
        result: falhaExterna(integ.name),
        error: `${err.message}${err.body ? ` | ${err.body}` : ''}`.slice(0, 2000),
      }
    }
    throw err
  }
}

export interface ExecuteInput {
  companyId: string
  conversationId: string | null
  name: string
  rawArgs: unknown
  runId?: string | null
  /** Botao "Testar": sem conversa, ignora se esta ligada, NAO aplica acoes no CRM. */
  test?: {
    tool: ResolvedTool
    /** Numero (caixa de entrada) usado no teste. */
    inboxId?: string | null
    /** Cliente do teste (nome/telefone enviados ao sistema externo). */
    cliente?: { nome?: string | null; telefone?: string | null } | null
  }
}

export async function executeTool(input: ExecuteInput): Promise<ExecuteResult> {
  const inicio = Date.now()
  const tool = input.test ? input.test.tool : await resolveCompanyTool(input.companyId, input.name)
  const args = parseArgs(input.rawArgs)
  // Grava os argumentos validados quando houver (e o que a checagem de
  // repeticao compara); antes da validacao, o que chegou.
  let argsParaLog: unknown = args

  const registrar = async (r: ExecuteResult & { avisos?: string[] }) => {
    const erroLog = [r.error, ...(r.avisos ?? [])].filter(Boolean).join(' | ') || null
    await prisma.aiToolCall
      .create({
        data: {
          companyId: input.companyId,
          conversationId: input.conversationId,
          toolName: input.name,
          source: tool?.source ?? 'unknown',
          integrationId: tool?.integration?.id ?? null,
          runId: input.runId ?? null,
          arguments: (argsParaLog && typeof argsParaLog === 'object' ? argsParaLog : {}) as Prisma.InputJsonValue,
          result: r.result.slice(0, 8000),
          ok: r.ok,
          error: erroLog ? erroLog.slice(0, 4000) : null,
          httpStatus: r.httpStatus ?? null,
          durationMs: Date.now() - inicio,
        },
      })
      .catch((e) => console.error('[ai-tools] falha ao registrar chamada', e))
    if (input.conversationId) {
      await publishEvent(input.companyId, { type: 'execution:log', conversationId: input.conversationId })
    }
    return { ok: r.ok, result: r.result, error: r.error, httpStatus: r.httpStatus, repeated: r.repeated }
  }

  if (!tool) {
    return registrar({
      ok: false,
      result: `A ferramenta "${input.name}" não está disponível. Siga sem ela ou ofereça transferir para um atendente.`,
      error: 'ferramenta inexistente ou desligada',
    })
  }

  // Um modo por WhatsApp (ferramentas do CRM OU servidor MCP): o n8n com lista
  // antiga, ou o modelo inventando, nao roda ferramenta do outro modo.
  if (!input.test && input.conversationId) {
    const agente = await resolverAgenteDaConversa(input.companyId, input.conversationId)
    if (!cabeNoModo(tool, agente)) {
      return registrar({
        ok: false,
        result: `A ferramenta "${tool.label}" não está ligada neste WhatsApp. Siga sem ela ou ofereça transferir para um atendente.`,
        error: `ferramenta fora do modo deste WhatsApp (${agente?.toolMode === 'mcp' ? 'servidor MCP' : 'ferramentas do CRM'})`,
      })
    }
  }

  const validacao = tool.mcp ? validarArgsMcp(tool.mcp.inputSchema, args) : validateArgs(tool.parameters, args)
  if (!validacao.ok) {
    return registrar({
      ok: false,
      result: `Não executei "${tool.label}": ${validacao.problems.join('; ')}. Pergunte ao cliente o que falta (ou corrija o formato) e tente de novo.`,
      error: `argumentos invalidos: ${validacao.problems.join('; ')}`,
    })
  }

  argsParaLog = validacao.args

  const config = tool.integration ? decryptConfig(tool.integration.configFields, tool.integration.companyConfig) : {}
  const ctx = input.test
    ? await buildTestContext(input.companyId, config, input.test.inboxId, input.test.cliente)
    : input.conversationId
      ? await buildConversationContext(input.companyId, input.conversationId, config)
      : null
  if (!ctx) {
    return registrar({ ok: false, result: 'Conversa não encontrada.', error: 'conversa inexistente ou de outro restaurante' })
  }

  // A IA as vezes repete a mesma chamada (retry, run duplicado). Pra acao que
  // escreve (criar/cancelar), repetir em menos de 2 min devolve o resultado
  // anterior em vez de reservar duas vezes.
  if (tool.isWrite && !input.test && input.conversationId) {
    const anterior = await prisma.aiToolCall.findFirst({
      where: {
        companyId: input.companyId,
        conversationId: input.conversationId,
        toolName: tool.name,
        ok: true,
        createdAt: { gte: new Date(Date.now() - REPETICAO_MS) },
        arguments: { equals: validacao.args as Prisma.InputJsonValue },
      },
      orderBy: { createdAt: 'desc' },
      select: { result: true },
    })
    if (anterior?.result) return { ok: true, result: anterior.result, repeated: true }
  }

  try {
    if (tool.source === 'native' && tool.native) {
      const r = input.test
        ? { ok: true, result: `(teste) A ferramenta nativa "${tool.label}" está pronta. Ela só roda dentro de uma conversa.` }
        : await tool.native.run(ctx, validacao.args as Record<string, string | number | boolean>)
      return registrar(r)
    }
    if (tool.mcp) return registrar(await runMcp(tool, ctx, validacao.args))
    return registrar(await runIntegration(tool, ctx, validacao.args as Record<string, string | number | boolean>, !input.test))
  } catch (error) {
    console.error('[ai-tools] erro ao executar', tool.name, error)
    return registrar({
      ok: false,
      result: `Não consegui concluir "${tool.label}" agora. Peça desculpas e ofereça transferir para um atendente.`,
      error: error instanceof Error ? error.message : 'erro desconhecido',
    })
  }
}

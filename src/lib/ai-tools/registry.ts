import { prisma } from '@/lib/db'
import { enabledNativeNames, getNativeTool, NATIVE_TOOLS, type NativeTool } from './native'
import { parseParams, toFunctionDefinition } from './params'
import { parsePostActions } from './post-actions'
import { montarRoteiro } from './roteiro'
import { parseConfigFields } from './secrets'
import type { ConfigField, FunctionDefinition, PostAction, ToolParam } from './types'

/** Ferramenta pronta pra executar, nativa ou de integracao. */
export interface ResolvedTool {
  name: string
  label: string
  description: string
  promptHint: string | null
  parameters: ToolParam[]
  isWrite: boolean
  source: 'native' | 'integration'
  native?: NativeTool
  integration?: {
    id: string
    name: string
    baseUrl: string
    headers: unknown
    configFields: ConfigField[]
    /** Config salva do restaurante (cifrada nos campos secretos). */
    companyConfig: unknown
  }
  http?: {
    method: string
    path: string
    bodyTemplate: unknown
    responseTemplate: string | null
    postActions: PostAction[]
  }
  /** Ferramenta de servidor MCP: nome no servidor e o JSON Schema dos argumentos. */
  mcp?: {
    toolName: string
    inputSchema: Record<string, unknown>
  }
}

function fromNative(t: NativeTool): ResolvedTool {
  return {
    name: t.name,
    label: t.label,
    description: t.description,
    promptHint: t.promptHint,
    parameters: t.parameters,
    isWrite: t.isWrite,
    source: 'native',
    native: t,
  }
}

type ToolRow = {
  name: string
  label: string
  aiDescription: string
  promptHint: string | null
  parameters: unknown
  method: string
  path: string
  bodyTemplate: unknown
  responseTemplate: string | null
  postActions: unknown
  isWrite: boolean
  inputSchema?: unknown
}

type IntegrationRow = {
  id: string
  name: string
  kind?: string
  baseUrl: string
  headers: unknown
  configFields: unknown
}

function schemaMcp(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : { type: 'object', properties: {} }
}

export function fromIntegrationTool(tool: ToolRow, integration: IntegrationRow, companyConfig: unknown): ResolvedTool {
  return {
    name: tool.name,
    label: tool.label,
    description: tool.aiDescription,
    promptHint: tool.promptHint,
    parameters: parseParams(tool.parameters),
    isWrite: tool.isWrite,
    source: 'integration',
    integration: {
      id: integration.id,
      name: integration.name,
      baseUrl: integration.baseUrl,
      headers: integration.headers,
      configFields: parseConfigFields(integration.configFields),
      companyConfig,
    },
    http: {
      method: tool.method,
      path: tool.path,
      bodyTemplate: tool.bodyTemplate,
      responseTemplate: tool.responseTemplate,
      postActions: parsePostActions(tool.postActions),
    },
    ...(integration.kind === 'mcp' ? { mcp: { toolName: tool.path, inputSchema: schemaMcp(tool.inputSchema) } } : {}),
  }
}

/**
 * JSON Schema do servidor MCP -> definicao de funcao pra IA. Mantem os tipos
 * do servidor (objetos, listas, enums); so garante a casca que a OpenAI exige.
 */
function definicaoMcp(name: string, description: string, schema: Record<string, unknown>): FunctionDefinition {
  const props = schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
    ? (schema.properties as Record<string, unknown>)
    : {}
  const properties: Record<string, Record<string, unknown>> = {}
  for (const [k, v] of Object.entries(props)) {
    properties[k] = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  }
  const required = Array.isArray(schema.required)
    ? schema.required.filter((r): r is string => typeof r === 'string' && r in properties)
    : []
  return {
    type: 'function',
    function: {
      name,
      description: description.slice(0, 1000),
      parameters: { type: 'object', properties, required, additionalProperties: false },
    },
  }
}

/** No modo "Servidor MCP", das nativas so fica a que a IA precisa sempre. */
export const NATIVAS_NO_MODO_MCP = ['transferir_para_humano']

/**
 * Ferramentas LIGADAS que a IA recebe.
 *
 * Com `agentId`, vale o modo daquele WhatsApp (AiAgent.toolMode):
 *   - 'function_calls': nativas ligadas + integracoes do catalogo;
 *   - 'mcp': o servidor MCP privado do agente + "transferir para atendente".
 * Sem agente (ex.: fluxo n8n pedindo a lista), e o modo function_calls.
 */
export async function listCompanyTools(
  companyId: string,
  opcoes: { agentId?: string | null } = {}
): Promise<ResolvedTool[]> {
  const agente = opcoes.agentId
    ? await prisma.aiAgent.findFirst({ where: { id: opcoes.agentId, companyId }, select: { id: true, toolMode: true } })
    : null
  const modoMcp = agente?.toolMode === 'mcp'

  const [company, ativas] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { settings: true } }),
    prisma.companyIntegration.findMany({
      where: {
        companyId,
        enabled: true,
        integration: modoMcp && agente
          ? { isActive: true, aiAgentId: agente.id }
          : { isActive: true, companyId: null },
      },
      include: {
        integration: {
          include: { tools: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
        },
      },
    }),
  ])

  const tools: ResolvedTool[] = enabledNativeNames(company?.settings)
    .filter((n) => !modoMcp || NATIVAS_NO_MODO_MCP.includes(n))
    .map((n) => getNativeTool(n))
    .filter((t): t is NativeTool => !!t)
    .map(fromNative)

  for (const ci of ativas) {
    for (const t of ci.integration.tools) {
      if (ci.enabledTools.includes(t.name)) tools.push(fromIntegrationTool(t, ci.integration, ci.config))
    }
  }

  // Com uma ferramenta de reserva de integracao ligada, a nativa
  // "registrar_reserva" so confundiria a IA (duas formas de reservar).
  const temReservaExterna = tools.some((t) => t.source === 'integration' && t.http?.postActions.some((a) => a.type === 'registrar_reserva'))
  return temReservaExterna ? tools.filter((t) => t.name !== 'registrar_reserva') : tools
}

/**
 * Uma ferramenta ligada pro restaurante, pelo nome (pra EXECUTAR). Procura em
 * tudo que o restaurante tem ligado: nativas, catalogo e servidores MCP
 * privados. O nome e unico no sistema, entao nao ha ambiguidade; o modo de
 * cada WhatsApp so decide o que e OFERECIDO a IA (listCompanyTools).
 */
export async function resolveCompanyTool(companyId: string, name: string): Promise<ResolvedTool | null> {
  const native = getNativeTool(name)
  if (native) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { settings: true } })
    return enabledNativeNames(company?.settings).includes(name) ? fromNative(native) : null
  }
  const tool = await prisma.integrationTool.findFirst({
    where: { name, isActive: true, integration: { isActive: true } },
    include: { integration: true },
  })
  if (!tool) return null
  // Conexao privada so vale pro restaurante dono.
  if (tool.integration.companyId && tool.integration.companyId !== companyId) return null
  const ci = await prisma.companyIntegration.findUnique({
    where: { companyId_integrationId: { companyId, integrationId: tool.integrationId } },
    select: { enabled: true, enabledTools: true, config: true },
  })
  if (!ci?.enabled || !ci.enabledTools.includes(name)) return null
  return fromIntegrationTool(tool, tool.integration, ci.config)
}

/**
 * Ferramenta de integracao pelo nome, IGNORANDO se esta ligada (botao
 * "Testar" do super-admin e do restaurante).
 */
export async function resolveToolForTest(companyId: string, name: string): Promise<ResolvedTool | null> {
  const native = getNativeTool(name)
  if (native) return fromNative(native)
  const tool = await prisma.integrationTool.findUnique({ where: { name }, include: { integration: true } })
  if (!tool) return null
  const ci = await prisma.companyIntegration.findUnique({
    where: { companyId_integrationId: { companyId, integrationId: tool.integrationId } },
    select: { config: true },
  })
  return fromIntegrationTool(tool, tool.integration, ci?.config ?? {})
}

export function toFunctions(tools: ResolvedTool[]): FunctionDefinition[] {
  return tools.map((t) =>
    t.mcp ? definicaoMcp(t.name, t.description, t.mcp.inputSchema) : toFunctionDefinition(t.name, t.description, t.parameters)
  )
}

/**
 * Trecho de prompt com o que a IA pode fazer (somado ao prompt do agente): o
 * roteiro de quando e como usar cada ferramenta ligada (src/lib/ai-tools/roteiro.ts).
 */
export function buildCapabilitiesPrompt(tools: ResolvedTool[]): string {
  return montarRoteiro(tools)
}

export { NATIVE_TOOLS }

import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { isValidParamKey, isValidToolName, parseParams, PARAM_TYPES } from '@/lib/ai-tools/params'
import { parsePostActions } from '@/lib/ai-tools/post-actions'
import { NATIVE_TOOL_NAMES } from '@/lib/ai-tools/native'
import { MASK, parseConfigFields } from '@/lib/ai-tools/secrets'
import type { ConfigField, PostAction, ToolParam, ToolParamType } from '@/lib/ai-tools/types'

/**
 * Pecas comuns das rotas do catalogo de integracoes (super-admin):
 * autorizacao, validacao e serializacao (cabecalhos SEMPRE mascarados).
 */

export async function requireSuperAdmin(req: NextRequest): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  const { agentId } = await authenticate(req)
  if (!agentId) {
    return { ok: false, res: NextResponse.json({ error: 'Autenticação necessária' }, { status: 403 }) }
  }
  const role = await prisma.userRole.findFirst({
    where: { userId: agentId, role: 'super_admin' },
    select: { id: true },
  })
  if (!role) {
    return { ok: false, res: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }) }
  }
  return { ok: true }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export function notFound(message = 'Não encontrado'): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 })
}

/** 400 com a primeira mensagem legivel (a tela mostra no toast). */
export function invalid(error: z.ZodError): NextResponse {
  const first = error.issues[0]
  const where = first?.path.length ? `${first.path.map(String).join('.')}: ` : ''
  return NextResponse.json(
    {
      error: first ? `Dados inválidos (${where}${first.message})` : 'Dados inválidos',
      details: error.flatten().fieldErrors,
    },
    { status: 400 }
  )
}

/** Corpo JSON como objeto simples (ou null). */
export async function readObject(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function isPrismaUniqueError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

// ─── Integracao ─────────────────────────────────────

const KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/
// Nome de cabecalho HTTP valido (token RFC 7230).
const HEADER_NAME_RE = /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,100}$/

function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password
  } catch {
    return false
  }
}

const configFieldSchema = z.object({
  key: z.string().trim().regex(KEY_RE, 'Chave inválida (letras, números e _; sem começar com número)'),
  label: z.string().trim().min(1, 'Informe o rótulo').max(120),
  help: z.string().trim().max(500).nullable().optional(),
  required: z.boolean().optional(),
  secret: z.boolean().optional(),
})

export const integrationSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,40}$/, 'Use de 2 a 40 caracteres: letras minúsculas, números ou hífen'),
  name: z.string().trim().min(1, 'Informe o nome').max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  segment: z.string().trim().max(60).nullable().optional(),
  icon: z.string().trim().max(16).nullable().optional(),
  /** 'http' = ferramentas montadas aqui; 'mcp' = servidor MCP (ferramentas vêm dele). */
  kind: z.enum(['http', 'mcp']).optional(),
  baseUrl: z.string().trim().max(500).refine(isHttpsUrl, 'Use uma URL https válida'),
  headers: z.record(z.string(), z.string().max(4000)).superRefine((headers, ctx) => {
    for (const [name, value] of Object.entries(headers)) {
      if (!HEADER_NAME_RE.test(name.trim())) {
        ctx.addIssue({ code: 'custom', message: `Nome de cabeçalho inválido: "${name}"` })
      }
      if (/[\r\n]/.test(value)) {
        ctx.addIssue({ code: 'custom', message: `O valor do cabeçalho "${name}" não pode ter quebra de linha` })
      }
    }
    if (Object.keys(headers).length > 20) ctx.addIssue({ code: 'custom', message: 'No máximo 20 cabeçalhos' })
  }),
  configFields: z
    .array(configFieldSchema)
    .max(30)
    .superRefine((fields, ctx) => {
      const seen = new Set<string>()
      for (const f of fields) {
        if (seen.has(f.key)) ctx.addIssue({ code: 'custom', message: `Campo repetido: "${f.key}"` })
        seen.add(f.key)
      }
    }),
  testToolName: z.string().trim().max(64).nullable().optional(),
  testArgs: z.record(z.string(), z.unknown()).nullable().optional(),
  isActive: z.boolean().optional(),
})

export type IntegrationInput = z.infer<typeof integrationSchema>

export function normalizeConfigFields(fields: IntegrationInput['configFields']): ConfigField[] {
  return fields.map((f) => ({
    key: f.key,
    label: f.label,
    ...(f.help ? { help: f.help } : {}),
    required: f.required === true,
    secret: f.secret === true,
  }))
}

export const integrationInclude = {
  tools: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
  _count: { select: { companyIntegrations: { where: { enabled: true } } } },
} satisfies Prisma.IntegrationInclude

export type IntegrationRow = Prisma.IntegrationGetPayload<{ include: typeof integrationInclude }>
type ToolRow = IntegrationRow['tools'][number]

function jsonObject(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
}

/** Cabecalhos salvos -> { nome: MASK }. O valor nunca sai do servidor. */
export function maskedHeaders(raw: unknown): Record<string, string> {
  const obj = jsonObject(raw) ?? {}
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(obj)) {
    if (typeof value === 'string' && value) out[name] = MASK
  }
  return out
}

export interface SerializedTool {
  id: string
  integrationId: string
  name: string
  label: string
  aiDescription: string
  promptHint: string | null
  parameters: ToolParam[]
  method: string
  path: string
  bodyTemplate: unknown
  responseTemplate: string | null
  postActions: PostAction[]
  isWrite: boolean
  isActive: boolean
  sortOrder: number
  /** Restaurantes com a integracao ativa e esta ferramenta ligada. */
  companiesUsing: number
  createdAt: Date
  updatedAt: Date
}

/** Chave do mapa de uso: nome e unico, mas a ativacao e por integracao. */
function usageKey(integrationId: string, name: string): string {
  return `${integrationId}|${name}`
}

/** Quantos restaurantes (ativacao ligada) usam cada ferramenta. */
export async function loadToolUsage(integrationId?: string): Promise<Map<string, number>> {
  const rows = await prisma.companyIntegration.findMany({
    where: { enabled: true, ...(integrationId ? { integrationId } : {}) },
    select: { integrationId: true, enabledTools: true },
  })
  const usage = new Map<string, number>()
  for (const r of rows) {
    for (const name of r.enabledTools) {
      const key = usageKey(r.integrationId, name)
      usage.set(key, (usage.get(key) ?? 0) + 1)
    }
  }
  return usage
}

export function serializeTool(t: ToolRow, usage?: Map<string, number>): SerializedTool {
  return {
    id: t.id,
    integrationId: t.integrationId,
    name: t.name,
    label: t.label,
    aiDescription: t.aiDescription,
    promptHint: t.promptHint,
    parameters: parseParams(t.parameters),
    method: t.method,
    path: t.path,
    bodyTemplate: t.bodyTemplate ?? null,
    responseTemplate: t.responseTemplate,
    postActions: parsePostActions(t.postActions),
    isWrite: t.isWrite,
    isActive: t.isActive,
    sortOrder: t.sortOrder,
    companiesUsing: usage?.get(usageKey(t.integrationId, t.name)) ?? 0,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }
}

export function serializeIntegration(row: IntegrationRow, usage?: Map<string, number>) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    segment: row.segment,
    icon: row.icon,
    kind: row.kind === 'mcp' ? 'mcp' : 'http',
    baseUrl: row.baseUrl,
    headers: maskedHeaders(row.headers),
    configFields: parseConfigFields(row.configFields),
    testToolName: row.testToolName,
    testArgs: jsonObject(row.testArgs),
    isActive: row.isActive,
    companiesUsing: row._count.companyIntegrations,
    tools: row.tools.map((t) => serializeTool(t, usage)),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** Estado atual no formato de entrada (base do PUT parcial). */
export function integrationAsInput(row: IntegrationRow): Record<string, unknown> {
  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    segment: row.segment,
    icon: row.icon,
    kind: row.kind === 'mcp' ? 'mcp' : 'http',
    baseUrl: row.baseUrl,
    headers: maskedHeaders(row.headers),
    configFields: parseConfigFields(row.configFields),
    testToolName: row.testToolName,
    testArgs: jsonObject(row.testArgs),
    isActive: row.isActive,
  }
}

// ─── Ferramenta ─────────────────────────────────────

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

const paramSchema = z.object({
  key: z.string().trim().refine(isValidParamKey, 'Chave de parâmetro inválida (letras, números e _)'),
  type: z.custom<ToolParamType>(
    (v) => typeof v === 'string' && PARAM_TYPES.includes(v as ToolParamType),
    'Tipo de parâmetro inválido'
  ),
  description: z.string().trim().max(500).optional(),
  required: z.boolean().optional(),
  enum: z.array(z.string().trim().min(1).max(100)).max(50).nullable().optional(),
})

const tpl = z.string().trim().max(1000)

const postActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('registrar_reserva'),
    data: tpl.optional(),
    hora: tpl.optional(),
    pessoas: tpl.optional(),
    codigo: tpl.optional(),
    observacao: tpl.optional(),
    tipo: z.enum(['normal', 'evento']).optional(),
  }),
  z.object({ type: z.literal('cancelar_reserva_crm'), codigo: tpl.min(1, 'Informe o código') }),
  z.object({ type: z.literal('registrar_encaminhamento'), destino: z.enum(['humano', 'evento']) }),
  z.object({ type: z.literal('adicionar_etiqueta'), etiqueta: tpl.min(1, 'Informe a etiqueta') }),
])

export const toolSchema = z
  .object({
    name: z
      .string()
      .trim()
      .refine(isValidToolName, 'Nome inválido: use snake_case (minúsculas, números e _), começando com letra'),
    label: z.string().trim().min(1, 'Informe como o restaurante vê a ferramenta').max(120),
    aiDescription: z.string().trim().min(1, 'Explique quando a IA deve usar').max(2000),
    promptHint: z.string().trim().max(1000).nullable().optional(),
    parameters: z.array(paramSchema).max(30),
    method: z.enum(HTTP_METHODS),
    path: z
      .string()
      .trim()
      .max(500)
      .refine((p) => p === '' || (p.startsWith('/') && !p.includes('://')), 'O caminho deve começar com "/" (ou ficar vazio)'),
    bodyTemplate: z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]).nullable(),
    responseTemplate: z.string().max(4000).nullable(),
    postActions: z.array(postActionSchema).max(10),
    isWrite: z.boolean(),
    isActive: z.boolean(),
    sortOrder: z.number().int().min(0).max(100000).optional(),
  })
  .superRefine((tool, ctx) => {
    const seen = new Set<string>()
    for (const p of tool.parameters) {
      if (seen.has(p.key)) ctx.addIssue({ code: 'custom', path: ['parameters'], message: `Parâmetro repetido: "${p.key}"` })
      seen.add(p.key)
    }
  })

export type ToolInput = z.infer<typeof toolSchema>

export const TOOL_DEFAULTS: Record<string, unknown> = {
  promptHint: null,
  parameters: [],
  method: 'POST',
  path: '',
  bodyTemplate: null,
  responseTemplate: null,
  postActions: [],
  isWrite: false,
  isActive: true,
}

export function toolAsInput(t: ToolRow): Record<string, unknown> {
  const s = serializeTool(t)
  return {
    name: s.name,
    label: s.label,
    aiDescription: s.aiDescription,
    promptHint: s.promptHint,
    parameters: s.parameters,
    method: s.method,
    path: s.path,
    bodyTemplate: s.bodyTemplate,
    responseTemplate: s.responseTemplate,
    postActions: s.postActions,
    isWrite: s.isWrite,
    isActive: s.isActive,
    sortOrder: s.sortOrder,
  }
}

/** Dados prontos pro Prisma (create/update). */
export function toolData(input: ToolInput) {
  const parameters: ToolParam[] = input.parameters.map((p) => ({
    key: p.key,
    type: p.type,
    description: p.description ?? '',
    required: p.required === true,
    // Opcoes so fazem sentido em texto.
    ...(p.type === 'string' && p.enum?.length ? { enum: p.enum } : {}),
  }))
  // Campos vazios das acoes saem do JSON (o motor trata ausente como vazio).
  const postActions = input.postActions.map((a) =>
    Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined && v !== ''))
  )
  return {
    name: input.name,
    label: input.label,
    aiDescription: input.aiDescription,
    promptHint: input.promptHint ? input.promptHint : null,
    parameters: parameters as unknown as Prisma.InputJsonValue,
    method: input.method,
    path: input.path,
    bodyTemplate: input.bodyTemplate === null ? Prisma.DbNull : (input.bodyTemplate as Prisma.InputJsonValue),
    responseTemplate: input.responseTemplate && input.responseTemplate.trim() ? input.responseTemplate : null,
    postActions: postActions as unknown as Prisma.InputJsonValue,
    isWrite: input.isWrite,
    isActive: input.isActive,
  }
}

/**
 * Nome livre pra uma ferramenta? Retorna a resposta de erro (400/409) ou null.
 * `ignoreId`: a propria ferramenta, no PUT.
 */
export async function checkToolName(name: string, ignoreId?: string): Promise<NextResponse | null> {
  if (NATIVE_TOOL_NAMES.includes(name)) {
    return NextResponse.json(
      { error: `"${name}" é o nome de uma ferramenta nativa do CRM. Escolha outro nome.` },
      { status: 400 }
    )
  }
  const other = await prisma.integrationTool.findUnique({
    where: { name },
    select: { id: true, integration: { select: { name: true } } },
  })
  if (other && other.id !== ignoreId) {
    return NextResponse.json(
      {
        error: `Já existe uma ferramenta chamada "${name}" (integração ${other.integration.name}). O nome precisa ser único em todo o sistema.`,
      },
      { status: 409 }
    )
  }
  return null
}

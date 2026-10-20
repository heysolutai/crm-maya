import type { FunctionDefinition, ToolParam, ToolParamType } from './types'

/**
 * Parametros da ferramenta: viram o JSON Schema da funcao (o que a IA ve) e
 * sao validados no servidor antes de qualquer chamada. A IA erra formato com
 * frequencia ("amanha", "8 da noite"): o erro volta pra ela com instrucao clara
 * pra perguntar ou corrigir, em vez de mandar lixo pro sistema externo.
 */

export const PARAM_TYPES: ToolParamType[] = ['string', 'number', 'integer', 'boolean', 'date', 'time']

const NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/

export function isValidParamKey(key: string): boolean {
  return NAME_RE.test(key)
}

export function isValidToolName(name: string): boolean {
  return /^[a-z][a-z0-9_]{1,63}$/.test(name)
}

/** Leitura defensiva do JSON salvo no banco. */
export function parseParams(raw: unknown): ToolParam[] {
  if (!Array.isArray(raw)) return []
  const out: ToolParam[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const p = item as Record<string, unknown>
    const key = typeof p.key === 'string' ? p.key : ''
    const type = PARAM_TYPES.includes(p.type as ToolParamType) ? (p.type as ToolParamType) : 'string'
    if (!isValidParamKey(key)) continue
    out.push({
      key,
      type,
      description: typeof p.description === 'string' ? p.description : '',
      required: p.required === true,
      enum: Array.isArray(p.enum) ? p.enum.filter((e): e is string => typeof e === 'string') : undefined,
    })
  }
  return out
}

function schemaFor(p: ToolParam): Record<string, unknown> {
  const base: Record<string, unknown> = { description: p.description }
  switch (p.type) {
    case 'number':
      return { ...base, type: 'number' }
    case 'integer':
      return { ...base, type: 'integer' }
    case 'boolean':
      return { ...base, type: 'boolean' }
    case 'date':
      return { ...base, type: 'string', description: `${p.description} (formato AAAA-MM-DD)`.trim() }
    case 'time':
      return { ...base, type: 'string', description: `${p.description} (formato HH:MM, 24h)`.trim() }
    default:
      return p.enum?.length ? { ...base, type: 'string', enum: p.enum } : { ...base, type: 'string' }
  }
}

export function toFunctionDefinition(name: string, description: string, params: ToolParam[]): FunctionDefinition {
  const properties: Record<string, Record<string, unknown>> = {}
  for (const p of params) properties[p.key] = schemaFor(p)
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties,
        required: params.filter((p) => p.required).map((p) => p.key),
        additionalProperties: false,
      },
    },
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function validDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false
  const d = new Date(`${s}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

export type ValidationResult =
  | { ok: true; args: Record<string, string | number | boolean> }
  | { ok: false; problems: string[] }

/**
 * Valida e normaliza (texto "4" vira numero, "20h" nao passa). Campos fora do
 * schema sao descartados: a IA nao consegue injetar parametro que a
 * ferramenta nao declarou.
 */
export function validateArgs(params: ToolParam[], raw: unknown): ValidationResult {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const args: Record<string, string | number | boolean> = {}
  const problems: string[] = []

  for (const p of params) {
    const v = input[p.key]
    const vazio = v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
    if (vazio) {
      if (p.required) problems.push(`${p.key}: obrigatório (${p.description || p.type})`)
      continue
    }

    switch (p.type) {
      case 'number':
      case 'integer': {
        const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
        if (!Number.isFinite(n) || (p.type === 'integer' && !Number.isInteger(n))) {
          problems.push(`${p.key}: precisa ser ${p.type === 'integer' ? 'um número inteiro' : 'um número'}`)
        } else args[p.key] = n
        break
      }
      case 'boolean': {
        if (typeof v === 'boolean') args[p.key] = v
        else if (v === 'true' || v === 'false') args[p.key] = v === 'true'
        else problems.push(`${p.key}: precisa ser verdadeiro ou falso`)
        break
      }
      case 'date': {
        const s = String(v).trim()
        if (!validDate(s)) problems.push(`${p.key}: use a data no formato AAAA-MM-DD`)
        else args[p.key] = s
        break
      }
      case 'time': {
        const s = String(v).trim()
        const normalizado = /^\d:\d{2}$/.test(s) ? `0${s}` : s
        if (!TIME_RE.test(normalizado)) problems.push(`${p.key}: use o horário no formato HH:MM`)
        else args[p.key] = normalizado
        break
      }
      default: {
        const s = String(v).trim().slice(0, 2000)
        if (p.enum?.length && !p.enum.includes(s)) problems.push(`${p.key}: use um destes valores: ${p.enum.join(', ')}`)
        else args[p.key] = s
      }
    }
  }

  return problems.length ? { ok: false, problems } : { ok: true, args }
}

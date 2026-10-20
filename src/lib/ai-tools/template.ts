/**
 * Preenchimento de modelos {{caminho}} nas ferramentas.
 *
 * Sem eval: so leitura de caminho em objeto (args.data, resposta.reservation.id).
 * Alternativas com || : {{args.customer_name || cliente.nome}} usa a primeira
 * que tiver valor.
 *
 * String que e EXATAMENTE um modelo ("{{args.people}}") devolve o valor cru,
 * preservando numero/booleano no JSON enviado. Misturada com texto, vira texto.
 */

const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g
const ONLY_PLACEHOLDER = /^\{\{\s*([^{}]+?)\s*\}\}$/

export type TemplateVars = Record<string, unknown>

function readPath(vars: TemplateVars, path: string): unknown {
  let current: unknown = vars
  for (const part of path.split('.')) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== 'object') return undefined
    // Sem prototype: so propriedades proprias.
    if (!Object.prototype.hasOwnProperty.call(current, part)) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
}

/** Resolve "a.b || c.d". Registra em `missing` os caminhos que ficaram vazios. */
function resolveExpression(expr: string, vars: TemplateVars, missing?: Set<string>): unknown {
  const alternatives = expr.split('||').map((s) => s.trim()).filter(Boolean)
  for (const alt of alternatives) {
    // Literal entre aspas como ultima alternativa: {{args.x || 'padrao'}}
    const literal = /^'(.*)'$/.exec(alt) || /^"(.*)"$/.exec(alt)
    if (literal) return literal[1]
    const value = readPath(vars, alt)
    if (!isEmpty(value)) return value
  }
  if (missing) missing.add(alternatives[alternatives.length - 1] ?? expr)
  return undefined
}

function stringify(v: unknown): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function renderString(template: string, vars: TemplateVars, missing?: Set<string>): unknown {
  const only = ONLY_PLACEHOLDER.exec(template)
  if (only) {
    const v = resolveExpression(only[1], vars, missing)
    return v === undefined ? null : v
  }
  return template.replace(PLACEHOLDER, (_, expr: string) => stringify(resolveExpression(expr, vars, missing)))
}

/** Preenche um valor JSON inteiro (objeto, lista, string). */
export function renderValue(value: unknown, vars: TemplateVars, missing?: Set<string>): unknown {
  if (typeof value === 'string') return renderString(value, vars, missing)
  if (Array.isArray(value)) return value.map((v) => renderValue(v, vars, missing))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = renderValue(v, vars, missing)
    return out
  }
  return value
}

/** Sempre texto (path de URL, cabecalho, resposta pra IA). */
export function renderText(template: string, vars: TemplateVars, missing?: Set<string>): string {
  return stringify(renderString(template, vars, missing))
}

/** Caminhos {{x}} usados num valor (pra tela mostrar o que a ferramenta usa). */
export function collectPaths(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') {
    for (const m of value.matchAll(PLACEHOLDER)) {
      for (const alt of m[1].split('||')) {
        const p = alt.trim()
        if (p && !/^['"]/.test(p)) into.add(p)
      }
    }
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectPaths(v, into))
  } else if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((v) => collectPaths(v, into))
  }
  return into
}

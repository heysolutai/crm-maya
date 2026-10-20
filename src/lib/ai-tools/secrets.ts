import { decryptApiKey, encryptApiKey } from '@/lib/api/api-key-utils'
import { SECRET_MASK, type ConfigField } from './types'

/**
 * Segredos das integracoes (cabecalhos da plataforma, campos secretos do
 * restaurante): guardados com a mesma criptografia das API keys.
 * Na tela vao sempre mascarados; string mascarada de volta = "nao mudou".
 */

export const MASK = SECRET_MASK

export function encryptSecret(value: string): string {
  return encryptApiKey(value)
}

export function decryptSecret(value: string): string {
  try {
    return decryptApiKey(value)
  } catch {
    return ''
  }
}

export function maskSecret(value: string | null | undefined): string {
  return value ? MASK : ''
}

/** Cabecalhos salvos ({ nome: cifrado }) -> texto puro, so no servidor. */
export function decryptHeaders(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value) out[name] = decryptSecret(value)
  }
  return out
}

/**
 * Mescla cabecalhos editados na tela com os salvos. Valor igual a MASK mantem
 * o anterior; string vazia remove; o resto e criptografado.
 */
export function mergeHeaders(previous: unknown, incoming: Record<string, string>): Record<string, string> {
  const prev = previous && typeof previous === 'object' ? (previous as Record<string, string>) : {}
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(incoming)) {
    const key = name.trim()
    if (!key) continue
    if (value === MASK) {
      if (prev[key]) out[key] = prev[key]
    } else if (value !== '') {
      out[key] = encryptSecret(value)
    }
  }
  return out
}

export function parseConfigFields(raw: unknown): ConfigField[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
    .map((f) => ({
      key: typeof f.key === 'string' ? f.key : '',
      label: typeof f.label === 'string' ? f.label : '',
      help: typeof f.help === 'string' ? f.help : undefined,
      required: f.required === true,
      secret: f.secret === true,
    }))
    .filter((f) => /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(f.key) && f.label)
}

/** Config do restaurante -> texto puro (servidor). */
export function decryptConfig(fields: ConfigField[], raw: unknown): Record<string, string> {
  const saved = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out: Record<string, string> = {}
  for (const f of fields) {
    const v = saved[f.key]
    if (typeof v !== 'string' || !v) continue
    out[f.key] = f.secret ? decryptSecret(v) : v
  }
  return out
}

/** Config do restaurante -> o que a tela pode ver (segredo mascarado). */
export function maskConfig(fields: ConfigField[], raw: unknown): Record<string, string> {
  const saved = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out: Record<string, string> = {}
  for (const f of fields) {
    const v = saved[f.key]
    if (typeof v !== 'string' || !v) continue
    out[f.key] = f.secret ? MASK : v
  }
  return out
}

/** Mescla config editada (MASK = manter). */
export function mergeConfig(
  fields: ConfigField[],
  previous: unknown,
  incoming: Record<string, string>
): Record<string, string> {
  const prev = previous && typeof previous === 'object' ? (previous as Record<string, string>) : {}
  const out: Record<string, string> = {}
  for (const f of fields) {
    const v = incoming[f.key]
    if (v === undefined || v === MASK) {
      if (prev[f.key]) out[f.key] = prev[f.key]
      continue
    }
    const trimmed = v.trim()
    if (!trimmed) continue
    out[f.key] = f.secret ? encryptSecret(trimmed) : trimmed.slice(0, 500)
  }
  return out
}

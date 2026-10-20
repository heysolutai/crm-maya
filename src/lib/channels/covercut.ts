/**
 * Cliente HTTP da Covercut (BSP da API oficial do WhatsApp / Meta Cloud API).
 *
 * Na interface o canal aparece so como "WhatsApp Cloud": Covercut e detalhe
 * de infraestrutura.
 *
 * Modelo SaaS (revendedor): UM par de credenciais pra plataforma toda
 * (COVERCUT_API_KEY + COVERCUT_API_SECRET no .env). Cada restaurante e
 * identificado pelo phone_number_id do numero, enviado no campo `from`.
 * Consequencia: quem souber o phone_number_id de outro restaurante consegue
 * operar o numero dele com as nossas credenciais. Por isso o cadastro de
 * numero e restrito ao super-admin e um phone_number_id so pode estar em
 * UMA inbox (ver POST /api/agents).
 *
 * Doc: https://api.covercut.com.br/docs/
 */

import { createHmac, timingSafeEqual } from 'crypto'
import { ChannelError, classifyHttpStatus, isNetworkError } from './errors'

const DEFAULT_BASE_URL = 'https://api.covercut.com.br/api/v1'

export function covercutBaseUrl(): string {
  return (process.env.COVERCUT_API_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

export function isCovercutConfigured(): boolean {
  return Boolean(process.env.COVERCUT_API_KEY && process.env.COVERCUT_API_SECRET)
}

function authHeaders(): Record<string, string> {
  return {
    'X-API-Key': process.env.COVERCUT_API_KEY || '',
    'X-API-Secret': process.env.COVERCUT_API_SECRET || '',
  }
}

/** Resposta de erro padrao da Covercut: { success:false, error, message, code? } */
interface CovercutErrorBody {
  success?: boolean
  error?: string
  message?: string
  code?: string
}

export type CovercutJson = Record<string, unknown>

/**
 * Chamada JSON a API. Lanca ChannelError com mensagem amigavel (sem
 * credenciais) quando a Covercut recusa ou esta fora do ar.
 */
export async function covercutRequest<T extends CovercutJson = CovercutJson>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  options: { query?: Record<string, string>; body?: CovercutJson } = {},
): Promise<T> {
  if (!isCovercutConfigured()) {
    throw new ChannelError(
      'WhatsApp Cloud nao configurado no servidor (COVERCUT_API_KEY / COVERCUT_API_SECRET).',
      'BAD_REQUEST',
    )
  }

  const url = new URL(`${covercutBaseUrl()}${path}`)
  for (const [k, v] of Object.entries(options.query || {})) url.searchParams.set(k, v)

  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...authHeaders(),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    })
  } catch (err) {
    console.error('[Covercut] falha de rede', method, path, (err as Error)?.message)
    throw new ChannelError(
      'Nao foi possivel falar com o WhatsApp Cloud. Tente de novo em instantes.',
      isNetworkError(err) ? 'NETWORK_ERROR' : 'PROVIDER_UNREACHABLE',
    )
  }

  const text = await res.text()
  let data: CovercutJson = {}
  try {
    data = text ? (JSON.parse(text) as CovercutJson) : {}
  } catch {
    data = { raw: text.slice(0, 500) }
  }

  const errorBody = data as CovercutErrorBody
  if (!res.ok || errorBody.success === false) {
    const code = res.ok ? 'BAD_REQUEST' : classifyHttpStatus(res.status)
    const detail = errorBody.message || errorBody.error || `HTTP ${res.status}`
    console.error('[Covercut] erro', method, path, res.status, errorBody.code || '', detail)
    throw new ChannelError(`WhatsApp Cloud: ${detail}`, code, {
      providerStatus: res.status,
      providerBody: data,
    })
  }

  return data as T
}

// ---------------------------------------------------------------------------
// Webhook

/**
 * Valida o header X-BSP-Signature: HMAC-SHA256 (hex) do corpo CRU com o
 * webhook_secret do numero. Comparacao timing-safe.
 */
export function verifyCovercutSignature(rawBody: string, signature: string | null, secret: string | null | undefined): boolean {
  if (!secret || !signature) return false
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const received = signature.trim().toLowerCase()
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(received, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// ---------------------------------------------------------------------------
// Midia

/**
 * A midia recebida chega so com o media_id da Meta. O pipeline de entrada
 * (o mesmo da UazAPI) precisa de uma "URL" de midia pra seguir; usamos uma
 * referencia interna que os workers de midia/transcricao reconhecem e
 * resolvem baixando pela Covercut. Nunca e exibida ao usuario: o worker troca
 * pela URL do storage.
 */
const MEDIA_REF_PREFIX = 'covercut-media://'

export function buildCovercutMediaRef(mediaId: string, phoneNumberId: string): string {
  return `${MEDIA_REF_PREFIX}${encodeURIComponent(mediaId)}?from=${encodeURIComponent(phoneNumberId)}`
}

export function isCovercutMediaRef(url: string | null | undefined): boolean {
  return typeof url === 'string' && url.startsWith(MEDIA_REF_PREFIX)
}

export function parseCovercutMediaRef(url: string): { mediaId: string; phoneNumberId: string } | null {
  if (!isCovercutMediaRef(url)) return null
  const rest = url.slice(MEDIA_REF_PREFIX.length)
  const [idPart, query = ''] = rest.split('?')
  const from = new URLSearchParams(query).get('from') || ''
  const mediaId = decodeURIComponent(idPart || '')
  if (!mediaId || !from) return null
  return { mediaId, phoneNumberId: from }
}

/** Baixa o binario da midia (GET /media/get?mode=stream). */
export async function downloadCovercutMedia(
  ref: string,
): Promise<{ buffer: Buffer; mimeType: string; fileName?: string } | null> {
  const parsed = parseCovercutMediaRef(ref)
  if (!parsed || !isCovercutConfigured()) return null

  const url = new URL(`${covercutBaseUrl()}/media/get`)
  url.searchParams.set('id', parsed.mediaId)
  url.searchParams.set('from', parsed.phoneNumberId)
  url.searchParams.set('mode', 'stream')

  try {
    const res = await fetch(url, { headers: authHeaders(), signal: AbortSignal.timeout(60_000) })
    if (!res.ok) {
      console.error('[Covercut] download de midia falhou', res.status, (await res.text()).slice(0, 300))
      return null
    }
    const contentType = (res.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim()

    // Sem mode=stream a API devolve JSON com base64; se por algum motivo
    // vier JSON aqui, tenta extrair.
    if (contentType === 'application/json') {
      const json = (await res.json()) as Record<string, unknown>
      const b64 = [json.base64, json.data, json.file].find((v): v is string => typeof v === 'string' && v.length > 10)
      if (!b64) return null
      const clean = b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64
      const mime = typeof json.mime_type === 'string' ? json.mime_type : typeof json.mimetype === 'string' ? json.mimetype : 'application/octet-stream'
      return { buffer: Buffer.from(clean, 'base64'), mimeType: mime }
    }

    const disposition = res.headers.get('content-disposition') || ''
    const fileName = /filename="?([^";]+)"?/i.exec(disposition)?.[1]
    const buffer = Buffer.from(await res.arrayBuffer())
    return { buffer, mimeType: contentType, fileName }
  } catch (err) {
    console.error('[Covercut] download de midia exception', (err as Error)?.message)
    return null
  }
}

// ---------------------------------------------------------------------------
// Numeros

export interface CovercutNumber {
  phone_number_id: string
  display_phone_number: string
  status?: string
  quality_rating?: string
  phone_tier?: string
  connected_at?: string
}

export async function listCovercutNumbers(): Promise<CovercutNumber[]> {
  const res = await covercutRequest<{ data?: { numbers?: CovercutNumber[] } }>('GET', '/numbers/list')
  return res.data?.numbers ?? []
}

export interface CovercutNumberStatus {
  phone_number_id: string
  display_phone_number?: string
  status?: string
  quality_rating?: string
  name_status?: string
  connected_at?: string
}

export async function getCovercutNumberStatus(phoneNumberId: string): Promise<CovercutNumberStatus> {
  const res = await covercutRequest<{ data?: CovercutNumberStatus }>('GET', '/numbers/status', {
    query: { from: phoneNumberId },
  })
  return res.data ?? { phone_number_id: phoneNumberId }
}

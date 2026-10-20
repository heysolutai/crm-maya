import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * HTTP das integracoes, com protecao contra SSRF: a URL e montada pelo
 * super-admin, mas nunca pode alcancar rede interna (Postgres, Redis, painel
 * do Docker) nem seguir redirect pra la.
 */

const TIMEOUT_MS = 15_000
const MAX_BYTES = 200_000

function ipv4Privado(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  )
}

function ipv6Privado(ip: string): boolean {
  const s = ip.toLowerCase()
  if (s === '::1' || s === '::') return true
  if (s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe80')) return true
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s)
  return mapped ? ipv4Privado(mapped[1]) : false
}

function enderecoPrivado(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) return ipv4Privado(ip)
  if (v === 6) return ipv6Privado(ip)
  return true
}

export class IntegrationHttpError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: string
  ) {
    super(message)
    this.name = 'IntegrationHttpError'
  }
}

/** Confere protocolo e destino. Lanca IntegrationHttpError se nao pode. */
export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new IntegrationHttpError('URL da integracao invalida')
  }
  if (url.protocol !== 'https:') throw new IntegrationHttpError('A integracao so pode chamar URLs https')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new IntegrationHttpError('Destino interno bloqueado')
  }
  if (isIP(host)) {
    if (enderecoPrivado(host)) throw new IntegrationHttpError('Destino interno bloqueado')
    return url
  }
  let addresses: { address: string }[]
  try {
    addresses = await lookup(host, { all: true })
  } catch {
    throw new IntegrationHttpError('Nao foi possivel resolver o endereco da integracao')
  }
  if (!addresses.length || addresses.some((a) => enderecoPrivado(a.address))) {
    throw new IntegrationHttpError('Destino interno bloqueado')
  }
  return url
}

export interface HttpResult {
  status: number
  /** JSON quando a resposta e JSON; senao { texto }. */
  data: unknown
}

export async function callIntegration(params: {
  method: string
  url: string
  headers: Record<string, string>
  body?: unknown
}): Promise<HttpResult> {
  const url = await assertSafeUrl(params.url)
  const method = params.method.toUpperCase()
  const hasBody = params.body !== undefined && params.body !== null && method !== 'GET' && method !== 'DELETE'

  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...params.headers,
      },
      body: hasBody ? JSON.stringify(params.body) : undefined,
      // Redirect poderia levar pra rede interna depois da checagem.
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    const msg = (err as Error)?.name === 'TimeoutError' ? 'tempo esgotado' : 'falha de rede'
    throw new IntegrationHttpError(`Sistema externo indisponivel (${msg})`)
  }

  if (res.status >= 300 && res.status < 400) {
    throw new IntegrationHttpError('Sistema externo respondeu com redirecionamento (bloqueado)', res.status)
  }

  const text = (await res.text()).slice(0, MAX_BYTES)
  let data: unknown
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { texto: text }
  }

  if (!res.ok) {
    throw new IntegrationHttpError(`Sistema externo respondeu ${res.status}`, res.status, text.slice(0, 1000))
  }
  return { status: res.status, data }
}

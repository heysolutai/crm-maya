import {
  IMPERSONATION_HEADER,
  IMPERSONATION_STORAGE_KEY,
  isValidCompanyId,
} from './impersonation'

/**
 * Le a empresa personificada direto do sessionStorage.
 *
 * Nao usa o hook `useImpersonation` de proposito: assim o `apiFetch` funciona
 * dentro de queryFn/mutationFn do React Query, que rodam fora do ciclo de
 * render e nao podem chamar hooks.
 */
function getImpersonatedCompanyId(): string | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = sessionStorage.getItem(IMPERSONATION_STORAGE_KEY)
    if (!stored) return null

    const parsed = JSON.parse(stored) as { companyId?: string }
    return isValidCompanyId(parsed?.companyId) ? parsed.companyId : null
  } catch {
    return null
  }
}

/** So injeta o header em chamadas pra propria origem — nunca pra terceiros. */
function isSameOrigin(input: RequestInfo | URL): boolean {
  try {
    const raw =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url

    if (raw.startsWith('/')) return true
    return new URL(raw, window.location.origin).origin === window.location.origin
  } catch {
    return false
  }
}

/**
 * `fetch` das chamadas internas de API.
 *
 * Identico ao fetch nativo, com uma diferenca: quando ha personificacao ativa,
 * anexa o header de empresa efetiva. Use sempre que a rota chamada depender do
 * companyId — que na pratica e toda rota sob `/api/` que nao seja publica.
 *
 * Sem isso, o super admin personificando bate na API com companyId nulo e a
 * rota responde 403 "Empresa nao encontrada".
 */
export function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const companyId = getImpersonatedCompanyId()
  if (!companyId || !isSameOrigin(input)) {
    return fetch(input, init)
  }

  const headers = new Headers(init.headers)
  headers.set(IMPERSONATION_HEADER, companyId)

  return fetch(input, { ...init, headers })
}

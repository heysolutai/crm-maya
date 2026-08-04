/**
 * Contrato de personificacao (super admin acessando dados de uma empresa).
 *
 * A personificacao vive no client (sessionStorage) — o servidor nao tem como
 * descobrir sozinho qual empresa o super admin esta olhando. O canal oficial
 * pra transportar isso e o header abaixo, injetado automaticamente pelo
 * `apiFetch` e lido pelo `authenticate()`.
 *
 * O header so tem efeito pra quem e super admin. Usuario comum que mandar o
 * header e ignorado — o companyId dele sempre vem da sessao.
 */
export const IMPERSONATION_HEADER = 'x-impersonate-company'

/** Chave do sessionStorage onde o estado de personificacao e persistido. */
export const IMPERSONATION_STORAGE_KEY = 'impersonation_state'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidCompanyId(value: string | null | undefined): value is string {
  return !!value && UUID_PATTERN.test(value)
}

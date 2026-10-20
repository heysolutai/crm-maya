import { apiFetch } from '@/lib/api/client';

/**
 * Cada passo do wizard expoe `save()` pro rodape do CompanySetup: o botao
 * "Salvar e continuar" fica num lugar so e cada passo sabe o que gravar.
 * Retorna false quando algo falhou (o passo ja avisou o usuario).
 */
export interface SetupStepHandle {
  save: () => Promise<boolean>;
}

interface ApiErrorBody {
  error?: unknown;
  details?: unknown;
}

/** Mensagem legivel de uma resposta de erro das nossas rotas (error + 1o detalhe do Zod). */
export async function readApiError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  const base = body && typeof body.error === 'string' && body.error.trim() ? body.error : fallback;
  if (body?.details && typeof body.details === 'object' && !Array.isArray(body.details)) {
    for (const [field, msgs] of Object.entries(body.details as Record<string, unknown>)) {
      if (Array.isArray(msgs) && typeof msgs[0] === 'string') {
        return `${base} (${field}: ${msgs[0]})`;
      }
    }
  }
  return base;
}

/** Envia JSON e lanca Error com a mensagem da API quando a resposta nao e ok. */
export async function sendJson<T = unknown>(
  url: string,
  method: 'POST' | 'PUT' | 'PATCH',
  body: unknown,
  fallbackError: string
): Promise<T> {
  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readApiError(res, fallbackError));
  return (await res.json().catch(() => ({}))) as T;
}

/** URL http(s) valida? Vazio conta como valido (campo opcional). */
export function isHttpUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Querystring de personificacao do super-admin. */
export function withCompany(path: string, companyId: string): string {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}companyId=${encodeURIComponent(companyId)}`;
}

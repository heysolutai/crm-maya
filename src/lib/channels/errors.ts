/**
 * Erros tipados de canal — permitem a UI distinguir entre:
 *   - "credencial errada" (usuario corrige) vs
 *   - "servidor offline" (problema infra, retry depois) vs
 *   - "instancia nao existe" (recriar) etc.
 *
 * Adapters devem lancar ChannelError em vez de Error generico. As rotas
 * traduzem o code pra um HTTP status + mensagem amigavel ao cliente.
 */

export type ChannelErrorCode =
  | 'INVALID_CREDENTIALS'      // 401/403 do provider — API key errada/expirada
  | 'INSTANCE_NOT_FOUND'       // 404 — instancia nao existe mais no provider
  | 'PROVIDER_UNREACHABLE'     // 5xx ou network error — servidor offline
  | 'NETWORK_ERROR'            // fetch falhou (DNS, TLS, timeout)
  | 'BAD_REQUEST'              // 400 — payload invalido / regra de negocio
  | 'CONFLICT'                 // 409 — instanceName ja em uso, etc
  | 'RATE_LIMITED'             // 429 — provider limitando taxa
  | 'UNKNOWN';                 // qualquer outro

export class ChannelError extends Error {
  code: ChannelErrorCode;
  httpStatus: number;          // sugestao de status pra retornar ao cliente
  providerStatus?: number;     // status HTTP que o provider retornou
  providerBody?: unknown;      // body do provider — pra log

  constructor(
    message: string,
    code: ChannelErrorCode,
    options?: { httpStatus?: number; providerStatus?: number; providerBody?: unknown }
  ) {
    super(message);
    this.name = 'ChannelError';
    this.code = code;
    this.httpStatus = options?.httpStatus ?? defaultHttpStatus(code);
    this.providerStatus = options?.providerStatus;
    this.providerBody = options?.providerBody;
  }

  /** Os codes que indicam que o agente deve ser marcado como `status=error`. */
  get isFatal(): boolean {
    return this.code === 'INVALID_CREDENTIALS' || this.code === 'INSTANCE_NOT_FOUND';
  }
}

function defaultHttpStatus(code: ChannelErrorCode): number {
  switch (code) {
    case 'INVALID_CREDENTIALS': return 401;
    case 'INSTANCE_NOT_FOUND':  return 404;
    case 'BAD_REQUEST':         return 400;
    case 'CONFLICT':            return 409;
    case 'RATE_LIMITED':        return 429;
    case 'PROVIDER_UNREACHABLE':
    case 'NETWORK_ERROR':       return 502;
    case 'UNKNOWN':
    default:                    return 500;
  }
}

/**
 * Classifica resposta HTTP de um provider em ChannelErrorCode.
 * Cada adapter pode usar isso pra mapear seus retornos sem repetir logica.
 */
export function classifyHttpStatus(status: number): ChannelErrorCode {
  if (status === 401 || status === 403) return 'INVALID_CREDENTIALS';
  if (status === 404)                   return 'INSTANCE_NOT_FOUND';
  if (status === 409)                   return 'CONFLICT';
  if (status === 429)                   return 'RATE_LIMITED';
  if (status >= 500)                    return 'PROVIDER_UNREACHABLE';
  if (status >= 400)                    return 'BAD_REQUEST';
  return 'UNKNOWN';
}

/**
 * Detecta se um erro "cru" de fetch e problema de rede (DNS, timeout, TLS).
 * Node fetch lanca TypeError com causa quando nao consegue conectar.
 */
export function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof TypeError) return true;
  const msg = (err as Error)?.message?.toLowerCase() || '';
  return (
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('enotfound') ||
    msg.includes('fetch failed') ||
    msg.includes('network')
  );
}

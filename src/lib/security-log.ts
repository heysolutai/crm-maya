import { prisma } from '@/lib/db';

/** Extrai o IP do cliente respeitando o proxy (Traefik/EasyPanel poe x-forwarded-for). */
export function getClientIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || null;
  return req.headers.get('x-real-ip') || null;
}

export type SecurityEvent =
  | 'login_success'
  | 'login_failed'
  | 'login_locked'
  | 'access_ai_config'
  | 'access_api_keys';

/**
 * Registra um evento de seguranca (login / acesso sensivel) na tabela login_logs.
 *
 * Best-effort: NUNCA lanca nem bloqueia a request — uma falha de log nao pode
 * quebrar o login nem o endpoint. Por isso tudo fica dentro de try/catch.
 */
export async function logSecurityEvent(params: {
  event: SecurityEvent;
  userId?: string | null;
  email?: string | null;
  companyId?: string | null;
  req?: Request;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    const ip = params.ip ?? (params.req ? getClientIp(params.req) : null);
    const userAgent =
      params.userAgent ?? (params.req ? params.req.headers.get('user-agent') : null);
    await prisma.loginLog.create({
      data: {
        event: params.event,
        userId: params.userId ?? null,
        email: params.email ?? null,
        companyId: params.companyId ?? null,
        ipAddress: ip,
        userAgent: userAgent ?? null,
      },
    });
  } catch (e) {
    console.error('[security-log] falha ao registrar evento (ignorado):', (e as Error)?.message);
  }
}

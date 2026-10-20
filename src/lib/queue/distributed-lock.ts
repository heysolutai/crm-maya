import { getRedisConnection } from './connection'

/**
 * Lock distribuido simples sobre Redis (SET NX EX).
 *
 * Por que: dois jobs da MESMA conversa nunca podem rodar juntos (o Maestro
 * responderia duas vezes), mesmo com varios processos (PM2 cluster, web +
 * worker dedicado). So quem pega o lock executa; o outro volta
 * { acquired: false } e decide o que fazer (o Maestro reagenda o turno).
 *
 * Uso:
 *   const r = await withLock('maestro:<conversa>', 180, async () => { ... })
 *   if (!r.acquired) { ...outro processo ja esta nela... }
 *
 * Nota: lock best-effort, sem fencing token. Serve pra evitar resposta dupla;
 * NAO use pra exclusao mutua de secao critica financeira.
 */
export async function withLock<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<{ acquired: true; result: T } | { acquired: false }> {
  const redis = getRedisConnection()
  const lockKey = `lock:${key}`
  // Valor unico pra so liberar o proprio lock (evita liberar o lock de outro
  // processo que pegou depois que o nosso expirou).
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`

  // SET key token NX EX ttl: so seta se nao existe, com expiracao.
  const ok = await redis.set(lockKey, token, 'EX', ttlSeconds, 'NX')
  if (ok !== 'OK') {
    return { acquired: false }
  }

  try {
    const result = await fn()
    return { acquired: true, result }
  } finally {
    // Libera so se ainda for nosso (compare-and-delete via Lua, atomico).
    try {
      await redis.eval(
        `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
        1,
        lockKey,
        token
      )
    } catch {
      // Se a liberacao falhar, o TTL expira o lock de qualquer forma.
    }
  }
}

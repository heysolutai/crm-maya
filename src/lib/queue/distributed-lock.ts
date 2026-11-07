import { getRedisConnection } from './connection'

// Compare-and-delete atomico: so solta a trava se ela ainda for nossa.
const SOLTAR_SE_FOR_MINHA = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`

function novoToken(): string {
  return `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

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
  const token = novoToken()

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
      await redis.eval(SOLTAR_SE_FOR_MINHA, 1, lockKey, token)
    } catch {
      // Se a liberacao falhar, o TTL expira o lock de qualquer forma.
    }
  }
}

/**
 * Como withLock, mas ESPERA a vez em vez de desistir: pra secao critica curta
 * em que o segundo precisa rodar DEPOIS do primeiro (ex.: buscar-ou-criar o
 * contato e a conversa de mensagens do mesmo telefone que chegam juntas).
 *
 * Devolve a funcao que solta a trava (pode chamar mais de uma vez). Sem a
 * trava no prazo, ou com o Redis fora, segue sem ela: melhor arriscar uma
 * duplicata do que travar ou perder a mensagem.
 */
export async function pegarTravaEsperando(
  key: string,
  ttlSeconds: number,
  esperaMaxMs: number
): Promise<() => Promise<void>> {
  const semTrava = async () => {}
  const lockKey = `lock:${key}`
  const token = novoToken()
  try {
    const redis = getRedisConnection()
    const limite = Date.now() + esperaMaxMs
    while ((await redis.set(lockKey, token, 'EX', ttlSeconds, 'NX')) !== 'OK') {
      if (Date.now() >= limite) {
        console.warn(`[lock] ${key}: sem a trava em ${esperaMaxMs}ms, seguindo sem`)
        return semTrava
      }
      await new Promise((r) => setTimeout(r, 50))
    }
    return async () => {
      try {
        await redis.eval(SOLTAR_SE_FOR_MINHA, 1, lockKey, token)
      } catch {
        // TTL expira a trava de qualquer forma.
      }
    }
  } catch (e) {
    console.warn(`[lock] ${key}: Redis indisponivel, seguindo sem trava:`, (e as Error).message)
    return semTrava
  }
}

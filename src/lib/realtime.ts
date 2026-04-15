import IORedis from 'ioredis';

// Conexao publisher (pode compartilhar com BullMQ)
let publisher: IORedis | null = null;

function getPublisher(): IORedis {
  if (!publisher || publisher.status === 'end' || publisher.status === 'close') {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    publisher = new IORedis(redisUrl, {
      maxRetriesPerRequest: null, // nao falha comandos em caso de retry
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy: (times: number) => Math.min(times * 200, 2000),
    });
    publisher.on('error', (err) => {
      console.error('[Realtime] Publisher error:', err.message);
    });
    publisher.on('end', () => {
      console.warn('[Realtime] Publisher connection ended — proxima publicacao reconecta');
      publisher = null;
    });
    publisher.on('ready', () => {
      console.log('[Realtime] Publisher conectado');
    });
  }
  return publisher;
}

// Cada subscriber precisa de uma conexao dedicada (IORedis em modo subscribe nao aceita outros comandos)
export function createSubscriber(): IORedis {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const sub = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy: (times: number) => Math.min(times * 200, 2000),
  });
  sub.on('error', (err) => {
    console.error('[Realtime] Subscriber error:', err.message);
  });
  return sub;
}

export type RealtimeEvent =
  | { type: 'message:new'; conversationId: string; message: unknown }
  | { type: 'message:delete'; conversationId: string; messageId: string }
  | { type: 'message:update'; conversationId: string; messageId: string; patch: Record<string, unknown> }
  | { type: 'conversation:update'; conversationId: string };

export function channelForCompany(companyId: string): string {
  return `realtime:company:${companyId}`;
}

export async function publishEvent(companyId: string, event: RealtimeEvent): Promise<void> {
  try {
    const channel = channelForCompany(companyId);
    const result = await getPublisher().publish(channel, JSON.stringify(event));
    if (result === 0) {
      // publish retorna numero de subscribers que receberam.
      // 0 = nenhum cliente conectado naquele momento (comum se ninguem abriu a UI).
      // Nao e erro, mas log debug pra facilitar diagnostico.
      console.log(`[Realtime] publish ${event.type} em ${channel} — 0 subscribers (ninguem online)`);
    }
  } catch (err) {
    console.error('[Realtime] publish falhou:', event.type, err);
  }
}

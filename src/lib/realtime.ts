import IORedis from 'ioredis';

// Conexao publisher (pode compartilhar com BullMQ)
let publisher: IORedis | null = null;

function getPublisher(): IORedis {
  if (!publisher) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    publisher = new IORedis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
    });
    publisher.on('error', (err) => {
      console.error('[Realtime] Publisher error:', err.message);
    });
  }
  return publisher;
}

// Cada subscriber precisa de uma conexao dedicada (IORedis em modo subscribe nao aceita outros comandos)
export function createSubscriber(): IORedis {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const sub = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
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
    await getPublisher().publish(channel, JSON.stringify(event));
  } catch (err) {
    console.warn('[Realtime] publish falhou:', err);
  }
}

import { NextRequest } from 'next/server';
import { authenticate } from '@/lib/api/auth';
import { createSubscriber, channelForCompany } from '@/lib/realtime';

// Forca runtime Node.js (ioredis nao roda em Edge) e desabilita qualquer cache.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

// Server-Sent Events stream para push realtime de mensagens/conversas.
// O cliente abre um EventSource('/api/conversations/events') e recebe:
//   - event: connected  (handshake inicial)
//   - event: ping       (heartbeat a cada 25s, evita timeout de proxies)
//   - event: message    (JSON do RealtimeEvent — uma mensagem nova/update/delete)
export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.companyId) {
    return new Response('Unauthorized', { status: 401 });
  }
  const companyId = auth.companyId;
  const clientId = Math.random().toString(36).slice(2, 8);
  const channel = channelForCompany(companyId);
  const tag = `[SSE:${clientId}:${companyId.slice(0, 8)}]`;

  console.log(`${tag} conexao iniciada (canal=${channel})`);

  const encoder = new TextEncoder();
  const subscriber = createSubscriber();

  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let eventsRelayed = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(data));
        } catch (err) {
          console.warn(`${tag} enqueue falhou:`, (err as Error).message);
          closed = true;
        }
      };

      const cleanup = async (reason: string) => {
        if (closed) return;
        closed = true;
        console.log(`${tag} fechando (motivo=${reason}, eventos_relay=${eventsRelayed})`);
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        try { await subscriber.unsubscribe(channel); } catch { /* noop */ }
        try { subscriber.disconnect(); } catch { /* noop */ }
        try { controller.close(); } catch { /* noop */ }
      };

      // 1. Handshake imediato — sinaliza pro cliente que a conexao abriu
      send(`event: connected\ndata: ${JSON.stringify({ companyId, clientId, ts: Date.now() })}\n\n`);

      // 2. Registra handlers do subscriber ANTES do subscribe, pra nao perder evento
      subscriber.on('message', (_chan, message) => {
        eventsRelayed++;
        console.log(`${tag} evento #${eventsRelayed} relay`);
        send(`event: message\ndata: ${message}\n\n`);
      });

      subscriber.on('error', (err) => {
        console.error(`${tag} subscriber error:`, err.message);
      });

      subscriber.on('end', () => {
        console.warn(`${tag} subscriber desconectou — fechando stream`);
        cleanup('subscriber_end');
      });

      subscriber.on('reconnecting', () => {
        console.log(`${tag} subscriber reconectando...`);
      });

      // 3. Subscribe no canal do Redis
      try {
        await subscriber.subscribe(channel);
        console.log(`${tag} subscrito em ${channel}`);
      } catch (err) {
        console.error(`${tag} falha ao subscribe:`, err);
        await cleanup('subscribe_failed');
        return;
      }

      // 4. Heartbeat — proxies cortam conexoes idle em 30-60s, ping a cada 25s
      heartbeat = setInterval(() => {
        send(`event: ping\ndata: ${Date.now()}\n\n`);
      }, 25_000);

      // 5. Cleanup quando o cliente fecha a aba/recarrega
      req.signal.addEventListener('abort', () => {
        cleanup('client_abort');
      });
    },
    cancel() {
      closed = true;
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      subscriber.unsubscribe(channel).catch(() => {});
      subscriber.disconnect();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform, no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // desabilita buffering no nginx
      'Content-Encoding': 'identity', // evita gzip quebrar o stream
    },
  });
}

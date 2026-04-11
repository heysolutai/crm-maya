import { NextRequest } from 'next/server';
import { authenticate } from '@/lib/api/auth';
import { createSubscriber, channelForCompany } from '@/lib/realtime';

// Server-Sent Events stream para push realtime de mensagens/conversas.
// O cliente abre um EventSource('/api/conversations/events') e recebe:
//   - event: ping       (heartbeat a cada 25s para evitar timeout de proxies)
//   - event: message    (JSON do RealtimeEvent)
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.companyId) {
    return new Response('Unauthorized', { status: 401 });
  }
  const companyId = auth.companyId;

  const encoder = new TextEncoder();
  const subscriber = createSubscriber();
  const channel = channelForCompany(companyId);

  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // controller closed
        }
      };

      // Evento inicial de conexao
      send(`event: connected\ndata: ${JSON.stringify({ companyId, ts: Date.now() })}\n\n`);

      // Heartbeat a cada 25s (proxies matam conexoes idle em ~30-60s)
      heartbeat = setInterval(() => {
        send(`event: ping\ndata: ${Date.now()}\n\n`);
      }, 25_000);

      // Subscribe no canal Redis desta company
      try {
        await subscriber.subscribe(channel);
      } catch (err) {
        console.error('[SSE] Falha ao subscribe:', err);
      }

      subscriber.on('message', (_chan, message) => {
        send(`event: message\ndata: ${message}\n\n`);
      });

      // Cleanup ao fechar
      req.signal.addEventListener('abort', () => {
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        subscriber.unsubscribe(channel).catch(() => {});
        subscriber.quit().catch(() => {});
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      subscriber.unsubscribe(channel).catch(() => {});
      subscriber.quit().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Desabilita buffering no nginx
    },
  });
}

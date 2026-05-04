import { NextRequest } from 'next/server';

// Proxy de midia: streama arquivos do bucket B2 via nosso dominio.
// Resolve dois problemas:
//   1) Content-Type — alguns navegadores recusam reproduzir audio quando o
//      upstream nao bate com o codec real (B2 as vezes retorna octet-stream).
//   2) CORS / decodeAudioData — fetch direto pro B2 falha por CORS, fazendo
//      o waveform cair no fallback fake. Servindo pelo mesmo origem, nao ha
//      preflight.
//
// Forward de Range header preserva seek em audios/videos longos.
//
// Whitelist por env: so URLs cujo prefixo bate com B2_PUBLIC_URL ou
// B2_ENDPOINT sao proxiadas. Evita que a rota vire SSRF generico.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAllowedUpstream(url: string): boolean {
  try {
    const u = new URL(url);
    const allowedPrefixes: string[] = [];
    if (process.env.B2_PUBLIC_URL) allowedPrefixes.push(process.env.B2_PUBLIC_URL.replace(/\/$/, ''));
    if (process.env.B2_ENDPOINT) allowedPrefixes.push(process.env.B2_ENDPOINT.replace(/\/$/, ''));
    if (allowedPrefixes.length === 0) return false;
    const target = `${u.origin}${u.pathname}`;
    return allowedPrefixes.some(prefix => target.startsWith(prefix) || `${u.origin}`.startsWith(prefix));
  } catch {
    return false;
  }
}

async function handleProxy(req: NextRequest) {
  const target = req.nextUrl.searchParams.get('url');
  if (!target) {
    return new Response('Missing url param', { status: 400 });
  }
  if (!isAllowedUpstream(target)) {
    return new Response('Upstream nao permitido', { status: 403 });
  }

  const upstreamHeaders: Record<string, string> = {};
  const range = req.headers.get('range');
  if (range) upstreamHeaders.Range = range;

  const upstream = await fetch(target, {
    headers: upstreamHeaders,
    cache: 'no-store',
  });

  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`Upstream ${upstream.status}`, { status: upstream.status });
  }

  const headers = new Headers();
  // Repassa cabecalhos relevantes pra streaming/seek
  const passthrough = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];
  for (const h of passthrough) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  // Cache no browser por 1h pra evitar re-buscar na proxima visualizacao
  headers.set('cache-control', 'private, max-age=3600');
  // Permite uso com crossOrigin="anonymous" + AudioContext.decodeAudioData
  headers.set('access-control-allow-origin', '*');

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}

export async function GET(req: NextRequest) {
  return handleProxy(req);
}

export async function HEAD(req: NextRequest) {
  return handleProxy(req);
}

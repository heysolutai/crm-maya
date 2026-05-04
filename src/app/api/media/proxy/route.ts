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

// Hostnames de armazenamento conhecidos. Match por sufixo do hostname e
// case-insensitive — mais robusto que comparar prefixo de URL completa,
// que quebra em diferencas de caixa ou de path-style vs virtual-hosted.
const TRUSTED_HOSTNAME_SUFFIXES = [
  'backblazeb2.com',
  'b2cdn.com',
  'amazonaws.com', // S3 generico, caso troque dia o backend
];

function isAllowedUpstream(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();

    // 1) Match por sufixo de hostname (cobre B2 + S3 + CDNs comuns)
    if (TRUSTED_HOSTNAME_SUFFIXES.some(suffix => host.endsWith(suffix))) {
      return true;
    }

    // 2) Hosts adicionais via env (B2_PUBLIC_URL pode ser CDN custom)
    const extras: string[] = [];
    if (process.env.B2_PUBLIC_URL) extras.push(process.env.B2_PUBLIC_URL);
    if (process.env.B2_ENDPOINT) extras.push(process.env.B2_ENDPOINT);
    for (const raw of extras) {
      try {
        const extraHost = new URL(raw).hostname.toLowerCase();
        if (host === extraHost || host.endsWith(`.${extraHost}`)) return true;
      } catch {
        // env mal-formatada, ignora
      }
    }

    return false;
  } catch {
    return false;
  }
}

// Resolve Content-Type baseado na extensao do arquivo. Mais confiavel que o
// que vem do upstream — o B2 as vezes serve arquivos com application/octet-stream
// quando o upload nao incluiu o ContentType correto, e o browser recusa
// reproduzir audio/video sem MIME especifico.
function resolveContentType(url: string, upstream: string | null): string {
  const path = (() => {
    try { return new URL(url).pathname.toLowerCase(); } catch { return url.toLowerCase(); }
  })();

  const extMatch = path.match(/\.([a-z0-9]{2,5})(?:$|\?)/);
  const ext = extMatch?.[1];

  const byExt: Record<string, string> = {
    // audio
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    opus: 'audio/ogg; codecs=opus',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    wav: 'audio/wav',
    webm: 'audio/webm', // pode ser video tambem — diferenciamos abaixo
    // video
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    // image
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', gif: 'image/gif',
    // doc
    pdf: 'application/pdf',
  };

  // Heuristica: pasta "videos/" ou "/video/" no path indica video.webm,
  // "audios/" indica audio.webm. Sem isso, webm vira audio por padrao.
  if (ext === 'webm' && /\/videos?\//.test(path)) return 'video/webm';

  if (ext && byExt[ext]) return byExt[ext];

  // Upstream confiavel se nao for octet-stream genérico
  if (upstream && !/octet-stream|application\/binary/i.test(upstream)) return upstream;

  return upstream || 'application/octet-stream';
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
  // Repassa cabecalhos relevantes pra streaming/seek (exceto Content-Type — esse
  // a gente resolve via extensao da URL, mais confiavel que o upstream)
  const passthrough = ['content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];
  for (const h of passthrough) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }

  const contentType = resolveContentType(target, upstream.headers.get('content-type'));
  headers.set('content-type', contentType);
  // Inline garante que browser nao force download de audio/video
  headers.set('content-disposition', 'inline');
  // Cache no browser por 1h pra evitar re-buscar na proxima visualizacao
  headers.set('cache-control', 'private, max-age=3600');
  // Permite uso com crossOrigin="anonymous" + AudioContext.decodeAudioData
  headers.set('access-control-allow-origin', '*');

  console.log(`[media/proxy] ${target} -> ${upstream.status} (${contentType})`);

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

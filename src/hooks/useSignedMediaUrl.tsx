import { useState, useEffect } from 'react';

/**
 * Gets a public URL for a media file.
 *
 * Estrategia: toda URL http(s) externa passa pelo /api/media/proxy. O proxy
 * tem whitelist server-side baseada em B2_PUBLIC_URL/B2_ENDPOINT (que sao
 * variaveis privadas, nao temos acesso no client) — entao ele aceita as URLs
 * de armazenamento configuradas e rejeita o resto. Isso resolve dois problemas:
 *   1) CORS — playback de audio + decode da waveform via mesma origem
 *   2) Content-Type — proxy forca o MIME correto via extensao do arquivo
 */

function isSameOriginPath(u: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const parsed = new URL(u);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

export function getPublicMediaUrl(mediaUrl: string | null): string | null {
  if (!mediaUrl) return null;

  if (mediaUrl.startsWith('http')) {
    // URLs do proprio dominio (incluindo /api/media/proxy) ja podem ir direto
    if (isSameOriginPath(mediaUrl)) return mediaUrl;
    return `/api/media/proxy?url=${encodeURIComponent(mediaUrl)}`;
  }

  if (mediaUrl.startsWith('/uploads/')) return mediaUrl;
  if (mediaUrl.startsWith('/api/')) return mediaUrl;

  // Caminho relativo solto -> /uploads/media/
  if (!mediaUrl.startsWith('/')) return `/uploads/media/${mediaUrl}`;

  return mediaUrl;
}

// Alias for backward compatibility
export const getSignedMediaUrl = async (mediaUrl: string | null): Promise<string | null> => {
  return getPublicMediaUrl(mediaUrl);
};

/**
 * Hook to get a public URL for media files
 */
export function useSignedMediaUrl(mediaUrl: string | null | undefined): {
  signedUrl: string | null;
  isLoading: boolean;
  error: Error | null;
} {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!mediaUrl) {
      setSignedUrl(null);
      return;
    }

    setIsLoading(true);
    try {
      const url = getPublicMediaUrl(mediaUrl);
      setSignedUrl(url);
      setError(null);
    } catch (err) {
      setError(err as Error);
      setSignedUrl(mediaUrl);
    } finally {
      setIsLoading(false);
    }
  }, [mediaUrl]);

  return { signedUrl, isLoading, error };
}

/**
 * Batch fetch public URLs for multiple media files
 */
export async function getSignedMediaUrls(mediaUrls: (string | null)[]): Promise<(string | null)[]> {
  return mediaUrls.map(url => getPublicMediaUrl(url));
}

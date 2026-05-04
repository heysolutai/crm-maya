import { useState, useEffect } from 'react';

/**
 * Gets a public URL for a media file.
 * With the move away from Supabase storage, files are now served from /uploads/
 *
 * URLs externas conhecidas (B2/Backblaze) sao roteadas pelo /api/media/proxy
 * pra resolver problemas de CORS e Content-Type que quebram playback de audio.
 */
const PROXY_HOSTNAME_HINTS = ['backblazeb2.com', 'b2cdn.com'];

export function getPublicMediaUrl(mediaUrl: string | null): string | null {
  if (!mediaUrl) return null;

  // URLs absolutas: B2/Backblaze passam pelo proxy; outras voltam como vieram.
  if (mediaUrl.startsWith('http')) {
    try {
      const u = new URL(mediaUrl);
      const isB2 = PROXY_HOSTNAME_HINTS.some(h => u.hostname.includes(h));
      if (isB2) {
        return `/api/media/proxy?url=${encodeURIComponent(mediaUrl)}`;
      }
    } catch {
      // url invalida — devolve raw
    }
    return mediaUrl;
  }

  if (mediaUrl.startsWith('/uploads/')) return mediaUrl;

  // If it looks like a relative path, prefix with /uploads/media/
  if (!mediaUrl.startsWith('/')) {
    return `/uploads/media/${mediaUrl}`;
  }

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

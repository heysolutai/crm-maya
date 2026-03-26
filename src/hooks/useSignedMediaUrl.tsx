import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';

/**
 * Extracts the file path from a stored media URL
 * Handles both old public URLs and new path-only format
 */
function extractFilePath(mediaUrl: string): string | null {
  if (!mediaUrl) return null;
  
  // If it's already just a path (new format)
  if (!mediaUrl.startsWith('http')) {
    return mediaUrl;
  }
  
  // Extract path from public URL format
  // Format: https://{project}.supabase.co/storage/v1/object/public/conversation-media/{path}
  const match = mediaUrl.match(/\/storage\/v1\/object\/public\/conversation-media\/(.+)$/);
  if (match) {
    return match[1];
  }
  
  // Fallback: try to extract anything after the bucket name
  const fallbackMatch = mediaUrl.match(/conversation-media\/(.+)$/);
  if (fallbackMatch) {
    return fallbackMatch[1];
  }
  
  return null;
}

/**
 * Gets a public URL for a media file
 * Since bucket is now public, no signing is needed
 */
export function getPublicMediaUrl(mediaUrl: string | null): string | null {
  if (!mediaUrl) {
    console.log('[Media Debug] getPublicMediaUrl: mediaUrl is null/empty');
    return null;
  }
  
  console.log('[Media Debug] getPublicMediaUrl input:', mediaUrl);
  
  // If it's already a full URL, return as-is
  if (mediaUrl.startsWith('http')) {
    console.log('[Media Debug] Already a full URL, returning as-is');
    return mediaUrl;
  }
  
  const filePath = extractFilePath(mediaUrl);
  console.log('[Media Debug] Extracted file path:', filePath);
  
  if (!filePath) {
    console.log('[Media Debug] Could not extract file path, returning original');
    return mediaUrl;
  }
  
  // Generate public URL
  const { data } = supabase.storage
    .from('conversation-media')
    .getPublicUrl(filePath);
  
  const publicUrl = data?.publicUrl || mediaUrl;
  console.log('[Media Debug] Generated public URL:', publicUrl);
  
  return publicUrl;
}

// Alias for backward compatibility
export const getSignedMediaUrl = async (mediaUrl: string | null): Promise<string | null> => {
  return getPublicMediaUrl(mediaUrl);
};

/**
 * Hook to get a public URL for media files
 * Simplified since bucket is now public
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
      setSignedUrl(mediaUrl); // Fallback
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

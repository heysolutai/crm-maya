import { useState, useEffect } from 'react';
import { useSignedMediaUrl } from '@/hooks/useSignedMediaUrl';
import { Loader2 } from 'lucide-react';

interface SecureImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  onClick?: () => void;
}

export function SecureImage({ src, alt, className, loading = 'lazy', onClick }: SecureImageProps) {
  const { signedUrl, isLoading } = useSignedMediaUrl(src);
  
  if (isLoading || !signedUrl) {
    return (
      <div className={`flex items-center justify-center bg-muted ${className}`}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  return (
    <img
      src={signedUrl}
      alt={alt}
      className={className}
      loading={loading}
      onClick={onClick}
    />
  );
}

interface SecureVideoProps {
  src: string | null | undefined;
  className?: string;
  controls?: boolean;
  onClick?: () => void;
}

export function SecureVideo({ src, className, controls = true, onClick }: SecureVideoProps) {
  const { signedUrl, isLoading } = useSignedMediaUrl(src);
  
  if (isLoading || !signedUrl) {
    return (
      <div className={`flex items-center justify-center bg-muted ${className}`}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  return (
    <video
      controls={controls}
      src={signedUrl}
      className={className}
      onClick={onClick}
    >
      Seu navegador não suporta vídeo
    </video>
  );
}

interface SecureAudioProps {
  src: string | null | undefined;
  isClient?: boolean;
}

export function SecureAudioSource({ src, children }: { src: string | null | undefined; children: (signedUrl: string | null) => React.ReactNode }) {
  const { signedUrl, isLoading } = useSignedMediaUrl(src);
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  return <>{children(signedUrl)}</>;
}

interface SecureDocumentUrlProps {
  src: string | null | undefined;
  children: (signedUrl: string | null, isLoading: boolean) => React.ReactNode;
}

export function SecureDocumentUrl({ src, children }: SecureDocumentUrlProps) {
  const { signedUrl, isLoading } = useSignedMediaUrl(src);
  return <>{children(signedUrl, isLoading)}</>;
}

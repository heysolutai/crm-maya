import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useToast } from './use-toast';

export type MediaType = 'image' | 'video' | 'document' | 'audio';

interface UploadResult {
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  mediaType: MediaType;
}

// Limites de tamanho (em bytes) - mais restritivos como WhatsApp
const MAX_SIZES: Record<MediaType, number> = {
  image: 2 * 1024 * 1024,     // 2MB (após compressão)
  video: 16 * 1024 * 1024,    // 16MB (padrão WhatsApp)
  document: 10 * 1024 * 1024, // 10MB
  audio: 16 * 1024 * 1024,    // 16MB
};

const MAX_IMAGE_DIMENSION = 1600; // WhatsApp usa ~1600px
const JPEG_QUALITY = 0.8; // 80% qualidade

/**
 * Comprime uma imagem redimensionando e convertendo para JPEG
 * Similar ao comportamento do WhatsApp
 */
const compressImage = async (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    // GIFs não são comprimidos para manter animação
    if (file.type === 'image/gif') {
      resolve(file);
      return;
    }

    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      
      // Redimensionar mantendo proporção se exceder limite
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        if (width > height) {
          height = Math.round((height / width) * MAX_IMAGE_DIMENSION);
          width = MAX_IMAGE_DIMENSION;
        } else {
          width = Math.round((width / height) * MAX_IMAGE_DIMENSION);
          height = MAX_IMAGE_DIMENSION;
        }
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Falha ao criar contexto de canvas'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob(
        (blob) => {
          if (blob) {
            // Gerar nome com extensão .jpg
            const baseName = file.name.replace(/\.[^.]+$/, '');
            const compressedFile = new File([blob], `${baseName}.jpg`, {
              type: 'image/jpeg',
            });
            console.log(`Imagem comprimida: ${file.size} -> ${compressedFile.size} bytes (${Math.round((1 - compressedFile.size / file.size) * 100)}% redução)`);
            resolve(compressedFile);
          } else {
            reject(new Error('Falha na compressão da imagem'));
          }
        },
        'image/jpeg',
        JPEG_QUALITY
      );
    };
    
    img.onerror = () => reject(new Error('Falha ao carregar imagem'));
    img.src = URL.createObjectURL(file);
  });
};

export function useMediaUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();

  /**
   * Determines the media type based on MIME type
   */
  const getMediaType = (mimeType: string): MediaType => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'document';
  };

  /**
   * Gets the storage folder based on media type
   */
  const getStorageFolder = (mediaType: MediaType): string => {
    switch (mediaType) {
      case 'image':
        return 'images';
      case 'video':
        return 'videos';
      case 'audio':
        return 'audios';
      default:
        return 'documents';
    }
  };

  const uploadMedia = async (file: File): Promise<UploadResult> => {
    try {
      setIsUploading(true);
      setUploadProgress(0);

      const mimeType = file.type;
      let mediaType = getMediaType(mimeType);
      let fileToUpload = file;
      
      // Comprimir imagens automaticamente (exceto GIFs)
      if (mediaType === 'image' && mimeType !== 'image/gif') {
        setUploadProgress(10);
        console.log('Comprimindo imagem...');
        try {
          fileToUpload = await compressImage(file);
        } catch (compressError) {
          console.warn('Falha na compressão, usando original:', compressError);
          fileToUpload = file;
        }
      }

      setUploadProgress(20);

      // Validar tamanho após compressão
      const maxSize = MAX_SIZES[mediaType];
      if (fileToUpload.size > maxSize) {
        const sizeInMB = maxSize / (1024 * 1024);
        throw new Error(`Arquivo muito grande. Tamanho máximo para ${mediaType}: ${sizeInMB}MB`);
      }

      // Validate type
      const allowedTypes = [
        // Images
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/heic',
        'image/heif',
        // Videos
        'video/mp4',
        'video/quicktime',
        'video/webm',
        'video/3gpp',
        'video/mpeg',
        // Documents
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/zip',
        'application/x-rar-compressed',
        'application/x-7z-compressed',
        'text/plain',
        'text/csv',
        // Audio
        'audio/mpeg',
        'audio/mp3',
        'audio/ogg',
        'audio/wav',
        'audio/webm',
        'audio/aac',
      ];

      // Verificar tipo original do arquivo
      if (!allowedTypes.includes(mimeType)) {
        throw new Error('Tipo de arquivo não suportado. Use imagens (JPG, PNG, GIF, WebP), vídeos (MP4, WebM), áudios (MP3, OGG) ou documentos (PDF, DOC, XLS, etc).');
      }

      // Get user's company_id for RLS compliance
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('company_id')
        .eq('id', user.id)
        .single();

      if (userError || !userData?.company_id) {
        throw new Error('Empresa não encontrada para o usuário');
      }

      // Generate unique filename with company_id prefix for RLS
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 9);
      const extension = fileToUpload.name.split('.').pop() || 'bin';
      const uniqueFileName = `${timestamp}-${randomId}.${extension}`;
      const folder = getStorageFolder(mediaType);
      const filePath = `${userData.company_id}/${folder}/${uniqueFileName}`;

      setUploadProgress(40);

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('conversation-media')
        .upload(filePath, fileToUpload, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) throw error;

      setUploadProgress(80);

      // Generate signed URL for immediate use (bucket is now private)
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('conversation-media')
        .createSignedUrl(filePath, 3600); // 1 hour expiry

      if (signedUrlError) {
        console.error('Error generating signed URL:', signedUrlError);
        throw new Error('Falha ao gerar URL de acesso');
      }

      setUploadProgress(100);

      // Store just the file path for future signed URL generation
      return {
        url: filePath, // Store path, not full URL
        fileName: file.name, // Nome original para exibição
        fileSize: fileToUpload.size,
        mimeType: fileToUpload.type,
        mediaType: mediaType,
      };
    } catch (error: any) {
      console.error('Erro no upload:', error);
      toast({
        title: 'Erro no upload',
        description: error.message,
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  return { 
    uploadMedia, 
    isUploading, 
    uploadProgress,
    getMediaType,
  };
}

// Re-export for backward compatibility
export { useMediaUpload as useDocumentUpload };
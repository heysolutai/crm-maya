import { useState } from 'react';
import { useToast } from './use-toast';

export type MediaType = 'image' | 'video' | 'document' | 'audio';

interface UploadResult {
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  mediaType: MediaType;
}

const MAX_SIZES: Record<MediaType, number> = {
  image: 2 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  document: 10 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
};

const MAX_IMAGE_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

const compressImage = async (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/gif') {
      resolve(file);
      return;
    }

    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

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
            const baseName = file.name.replace(/\.[^.]+$/, '');
            const compressedFile = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
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

  const getMediaType = (mimeType: string): MediaType => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'document';
  };

  const getStorageFolder = (mediaType: MediaType): string => {
    switch (mediaType) {
      case 'image': return 'images';
      case 'video': return 'videos';
      case 'audio': return 'audios';
      default: return 'documents';
    }
  };

  const uploadMedia = async (file: File): Promise<UploadResult> => {
    try {
      setIsUploading(true);
      setUploadProgress(0);

      const mimeType = file.type;
      let mediaType = getMediaType(mimeType);
      let fileToUpload = file;

      if (mediaType === 'image' && mimeType !== 'image/gif') {
        setUploadProgress(10);
        try {
          fileToUpload = await compressImage(file);
        } catch {
          fileToUpload = file;
        }
      }

      setUploadProgress(20);

      const maxSize = MAX_SIZES[mediaType];
      if (fileToUpload.size > maxSize) {
        const sizeInMB = maxSize / (1024 * 1024);
        throw new Error(`Arquivo muito grande. Tamanho máximo para ${mediaType}: ${sizeInMB}MB`);
      }

      const allowedTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
        'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/mpeg',
        'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
        'text/plain', 'text/csv',
        'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/aac',
      ];

      if (!allowedTypes.includes(mimeType)) {
        throw new Error('Tipo de arquivo não suportado.');
      }

      setUploadProgress(40);

      // Upload via API route
      const formData = new FormData();
      formData.append('file', fileToUpload);
      formData.append('bucket', getStorageFolder(mediaType));

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
      }

      const uploadData = await res.json();
      setUploadProgress(100);

      return {
        url: uploadData.path || uploadData.url,
        fileName: file.name,
        fileSize: fileToUpload.size,
        mimeType: fileToUpload.type,
        mediaType: mediaType,
      };
    } catch (error: any) {
      console.error('Erro no upload:', error);
      toast({ title: 'Erro no upload', description: error.message, variant: 'destructive' });
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

export { useMediaUpload as useDocumentUpload };

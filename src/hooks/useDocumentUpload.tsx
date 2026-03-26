import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useToast } from './use-toast';

export function useDocumentUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();

  const uploadDocument = async (file: File) => {
    try {
      setIsUploading(true);
      setUploadProgress(0);

      // Validar tamanho (max 20MB)
      const maxSize = 20 * 1024 * 1024; // 20MB
      if (file.size > maxSize) {
        throw new Error('Arquivo muito grande. Tamanho máximo: 20MB');
      }

      // Validar tipo
      const allowedTypes = [
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
      ];

      if (!allowedTypes.includes(file.type)) {
        throw new Error('Tipo de arquivo não suportado. Use PDF, DOC, XLS, PPT, ZIP ou TXT.');
      }

      // Gerar nome único
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 9);
      const extension = file.name.split('.').pop();
      const uniqueFileName = `${timestamp}-${randomId}.${extension}`;
      const filePath = `documents/${uniqueFileName}`;

      setUploadProgress(30);

      // Upload para Supabase Storage
      const { data, error } = await supabase.storage
        .from('conversation-media')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) throw error;

      setUploadProgress(70);

      // Obter URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('conversation-media')
        .getPublicUrl(filePath);

      setUploadProgress(100);

      return {
        url: publicUrl,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
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
    uploadDocument, 
    isUploading, 
    uploadProgress 
  };
}

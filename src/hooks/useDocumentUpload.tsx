import { useState } from 'react';
import { useToast } from './use-toast';

export function useDocumentUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();

  const uploadDocument = async (file: File) => {
    try {
      setIsUploading(true);
      setUploadProgress(0);

      const maxSize = 20 * 1024 * 1024;
      if (file.size > maxSize) {
        throw new Error('Arquivo muito grande. Tamanho máximo: 20MB');
      }

      const allowedTypes = [
        'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
        'text/plain', 'text/csv',
      ];

      if (!allowedTypes.includes(file.type)) {
        throw new Error('Tipo de arquivo não suportado. Use PDF, DOC, XLS, PPT, ZIP ou TXT.');
      }

      setUploadProgress(30);

      // Upload via API route
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', 'documents');

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
        fileSize: file.size,
        mimeType: file.type,
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
    uploadDocument,
    isUploading,
    uploadProgress
  };
}

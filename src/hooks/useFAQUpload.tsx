import { useState, useCallback } from 'react';
import { invokeFn } from '@/lib/api-functions';
import { toast } from 'sonner';

export type ProcessingStatus = 'idle' | 'uploading' | 'processing' | 'success' | 'error';

interface UploadResult {
  success: boolean;
  fileUrl?: string;
  fileName?: string;
  error?: string;
  needsSync?: boolean;
}

export function useFAQUpload(companyId: string | undefined) {
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);

  const resetStatus = useCallback(() => {
    setProcessingStatus('idle');
    setIsProcessing(false);
    setUploadProgress(0);
  }, []);

  const uploadFAQFile = async (file: File): Promise<UploadResult> => {
    if (!companyId) {
      toast.error('Empresa não identificada');
      return { success: false, error: 'Empresa não identificada' };
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('Arquivo muito grande. Máximo permitido: 10MB');
      return { success: false, error: 'Arquivo muito grande' };
    }

    const allowedExtensions = ['.csv', '.xlsx', '.xls', '.json', '.txt', '.pdf'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();

    const allowedTypes = [
      'text/csv', 'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/json', 'text/plain', 'application/pdf',
    ];

    const isValidType = allowedTypes.includes(file.type) || allowedExtensions.includes(fileExtension);
    if (!isValidType) {
      toast.error('Tipo de arquivo não suportado. Use CSV, Excel, JSON, TXT ou PDF.');
      return { success: false, error: 'Tipo de arquivo não suportado' };
    }

    setIsUploading(true);
    setProcessingStatus('uploading');
    setUploadProgress(10);

    try {
      setUploadProgress(30);

      // Upload via API route
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', 'faq-uploads');

      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!uploadRes.ok) throw new Error('Erro no upload do arquivo');

      const uploadData = await uploadRes.json();
      const fileUrl = uploadData.url || uploadData.path;

      setUploadProgress(60);

      if (!fileUrl) throw new Error('Não foi possível obter a URL do arquivo');

      setUploadProgress(80);
      setIsUploading(false);
      setProcessingStatus('processing');
      setIsProcessing(true);

      // Notify N8N via API route
      const { data: notifyData, error: notifyError } = await invokeFn(
        'notify-faq-upload',
        {
          fileUrl: `${window.location.origin}${fileUrl}`,
          companyId: companyId,
          fileName: file.name,
          fileType: file.type || fileExtension,
          fileSize: file.size,
        }
      );

      setIsProcessing(false);
      setUploadProgress(100);

      if (notifyError) {
        console.error('Notify error:', notifyError);
        setProcessingStatus('error');
        return { success: false, error: 'Falha ao processar FAQs' };
      }

      if (notifyData?.success === false) {
        setProcessingStatus('error');
        return { success: false, error: notifyData?.message || 'Falha ao processar FAQs' };
      }

      setProcessingStatus('success');

      return {
        success: true,
        fileUrl,
        fileName: file.name,
        needsSync: true,
      };
    } catch (error) {
      console.error('FAQ upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error(`Erro ao enviar arquivo: ${errorMessage}`);
      setProcessingStatus('error');
      setIsUploading(false);
      setIsProcessing(false);
      return { success: false, error: errorMessage };
    }
  };

  return {
    uploadFAQFile,
    isUploading,
    isProcessing,
    processingStatus,
    uploadProgress,
    resetStatus,
  };
}

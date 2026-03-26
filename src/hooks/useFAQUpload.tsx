import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { invokeFn } from '@/lib/supabase-functions-adapter';
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

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('Arquivo muito grande. Máximo permitido: 10MB');
      return { success: false, error: 'Arquivo muito grande' };
    }

    // Validate file type
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/json',
      'text/plain',
      'application/pdf',
    ];
    const allowedExtensions = ['.csv', '.xlsx', '.xls', '.json', '.txt', '.pdf'];
    
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    const isValidType = allowedTypes.includes(file.type) || allowedExtensions.includes(fileExtension);
    
    if (!isValidType) {
      toast.error('Tipo de arquivo não suportado. Use CSV, Excel, JSON, TXT ou PDF.');
      return { success: false, error: 'Tipo de arquivo não suportado' };
    }

    setIsUploading(true);
    setProcessingStatus('uploading');
    setUploadProgress(10);

    try {
      // Generate unique file name
      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `${companyId}/faq-uploads/${timestamp}_${sanitizedName}`;

      setUploadProgress(30);

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('conversation-media')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error(`Erro no upload: ${uploadError.message}`);
      }

      setUploadProgress(60);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('conversation-media')
        .getPublicUrl(filePath);

      if (!urlData?.publicUrl) {
        throw new Error('Não foi possível obter a URL do arquivo');
      }

      setUploadProgress(80);
      setIsUploading(false);
      setProcessingStatus('processing');
      setIsProcessing(true);

      // Notify N8N via API route and wait for response
      const { data: notifyData, error: notifyError } = await invokeFn(
        'notify-faq-upload',
        {
            fileUrl: urlData.publicUrl,
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

      // Check N8N response
      if (notifyData?.success === false) {
        setProcessingStatus('error');
        return { success: false, error: notifyData?.message || 'Falha ao processar FAQs' };
      }

      setProcessingStatus('success');
      
      return {
        success: true,
        fileUrl: urlData.publicUrl,
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

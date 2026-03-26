import { Button } from '@/components/ui/button';
import { Download, FileText, FileSpreadsheet, FileImage, FileArchive, File } from 'lucide-react';

interface DocumentPreviewProps {
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  isClient: boolean;
}

export function DocumentPreview({ fileName, fileUrl, fileSize, isClient }: DocumentPreviewProps) {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  
  const getFileIcon = () => {
    const iconClass = 'h-6 w-6';
    
    if (['pdf'].includes(extension)) {
      return { 
        icon: <FileText className={iconClass} />, 
        bg: 'bg-red-100 dark:bg-red-900/20',
        color: 'text-red-600 dark:text-red-400'
      };
    }
    
    if (['doc', 'docx'].includes(extension)) {
      return { 
        icon: <FileText className={iconClass} />, 
        bg: 'bg-blue-100 dark:bg-blue-900/20',
        color: 'text-blue-600 dark:text-blue-400'
      };
    }
    
    if (['xls', 'xlsx', 'csv'].includes(extension)) {
      return { 
        icon: <FileSpreadsheet className={iconClass} />, 
        bg: 'bg-green-100 dark:bg-green-900/20',
        color: 'text-green-600 dark:text-green-400'
      };
    }
    
    if (['ppt', 'pptx'].includes(extension)) {
      return { 
        icon: <FileImage className={iconClass} />, 
        bg: 'bg-orange-100 dark:bg-orange-900/20',
        color: 'text-orange-600 dark:text-orange-400'
      };
    }
    
    if (['zip', 'rar', '7z'].includes(extension)) {
      return { 
        icon: <FileArchive className={iconClass} />, 
        bg: 'bg-yellow-100 dark:bg-yellow-900/20',
        color: 'text-yellow-600 dark:text-yellow-400'
      };
    }
    
    return { 
      icon: <File className={iconClass} />, 
      bg: 'bg-gray-100 dark:bg-gray-800',
      color: 'text-gray-600 dark:text-gray-400'
    };
  };
  
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };
  
  const handleDownload = async () => {
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao baixar arquivo:', error);
      // Fallback: abrir em nova aba
      window.open(fileUrl, '_blank');
    }
  };
  
  const { icon, bg, color } = getFileIcon();
  
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg max-w-sm ${
      isClient ? 'bg-muted' : 'bg-primary/10'
    }`}>
      {/* Ícone do arquivo */}
      <div className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center ${bg} ${color}`}>
        {icon}
      </div>
      
      {/* Info do arquivo */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{fileName}</p>
        {fileSize && (
          <p className="text-xs opacity-70">{formatFileSize(fileSize)}</p>
        )}
      </div>
      
      {/* Botão de download */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleDownload}
        className="flex-shrink-0 h-8 w-8"
      >
        <Download className="h-4 w-4" />
      </Button>
    </div>
  );
}

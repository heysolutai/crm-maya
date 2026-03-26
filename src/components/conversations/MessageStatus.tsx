import { Check, CheckCheck } from 'lucide-react';

interface MessageStatusProps {
  status?: 'sent' | 'delivered' | 'read';
  isClient: boolean;
}

export const MessageStatus = ({ status = 'sent', isClient }: MessageStatusProps) => {
  // Não mostrar status para mensagens de clientes
  if (isClient) return null;
  
  return (
    <span className="inline-flex ml-1 items-center">
      {status === 'sent' && (
        <Check className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
      )}
      {status === 'delivered' && (
        <CheckCheck className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
      )}
      {status === 'read' && (
        <CheckCheck className="h-3.5 w-3.5 text-blue-500" />
      )}
    </span>
  );
};

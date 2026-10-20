import { AlertCircle, Check, CheckCheck } from 'lucide-react';

interface MessageStatusProps {
  /** 'sent' | 'delivered' | 'read' | 'failed' (outros valores nao mostram nada). */
  status?: string;
  isClient: boolean;
}

// Cores do WhatsApp Web: cor atual semitransparente pra sent/delivered, azul #53bdeb pra read.
// 'failed' (nao chegou no WhatsApp): icone vermelho no lugar do tique.
export const MessageStatus = ({ status = 'sent', isClient }: MessageStatusProps) => {
  if (isClient) return null;

  const baseClass = 'h-[15px] w-[15px] shrink-0';

  return (
    <span className="inline-flex items-center">
      {status === 'sent' && <Check className={`${baseClass} opacity-60`} aria-label="Enviada" />}
      {status === 'delivered' && <CheckCheck className={`${baseClass} opacity-60`} aria-label="Entregue" />}
      {status === 'read' && <CheckCheck className={`${baseClass} text-[#53bdeb]`} aria-label="Lida" />}
      {status === 'failed' && (
        <AlertCircle className={`${baseClass} text-red-600 dark:text-red-400`} aria-label="Não enviada" />
      )}
    </span>
  );
};

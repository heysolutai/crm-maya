import { Check, CheckCheck } from 'lucide-react';

interface MessageStatusProps {
  status?: 'sent' | 'delivered' | 'read';
  isClient: boolean;
}

// Cores do WhatsApp Web: cor atual semitransparente pra sent/delivered, azul #53bdeb pra read
export const MessageStatus = ({ status = 'sent', isClient }: MessageStatusProps) => {
  if (isClient) return null;

  const baseClass = 'h-[15px] w-[15px] shrink-0';

  return (
    <span className="inline-flex items-center">
      {status === 'sent' && <Check className={`${baseClass} opacity-60`} />}
      {status === 'delivered' && <CheckCheck className={`${baseClass} opacity-60`} />}
      {status === 'read' && <CheckCheck className={`${baseClass} text-[#53bdeb]`} />}
    </span>
  );
};

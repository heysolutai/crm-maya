import type { QuotedMessage, Client } from './types';

interface QuotedMessagePreviewProps {
  quotedMessage: QuotedMessage | undefined;
  isClient: boolean;
  client: Client | null;
  onScrollToMessage: (messageId: string) => void;
}

export function QuotedMessagePreview({
  quotedMessage,
  isClient,
  client,
  onScrollToMessage,
}: QuotedMessagePreviewProps) {
  if (!quotedMessage) return null;
  
  const quotedIsClient = quotedMessage.sender_type === 'client';
  const quotedSenderName = quotedIsClient 
    ? (client 
        ? `${client.first_name} ${client.last_name || ''}`.trim()
        : 'Cliente'
      )
    : quotedMessage.sender?.full_name || 'Você';
  
  // Preview do conteúdo baseado no tipo
  let contentPreview = '';
  if (quotedMessage.message_type === 'image') {
    contentPreview = '📷 Foto';
  } else if (quotedMessage.message_type === 'audio') {
    contentPreview = '🎤 Áudio';
  } else if (quotedMessage.message_type === 'video') {
    contentPreview = '🎥 Vídeo';
  } else if (quotedMessage.message_type === 'document') {
    contentPreview = '📄 Documento';
  } else if (quotedMessage.message_type === 'location') {
    contentPreview = '📍 Localização';
  } else if (quotedMessage.message_type === 'sticker') {
    contentPreview = '🎨 Sticker';
  } else if (quotedMessage.message_type === 'contact' || quotedMessage.message_type === 'vcard') {
    contentPreview = '👤 Contato';
  } else {
    contentPreview = quotedMessage.message_text || '';
  }
  
  // Limitar preview a 50 caracteres
  if (contentPreview.length > 50) {
    contentPreview = contentPreview.substring(0, 50) + '...';
  }
  
  return (
    <div 
      onClick={() => onScrollToMessage(quotedMessage.id)}
      className={`border-l-4 pl-2 py-1 mb-2 rounded cursor-pointer hover:opacity-80 transition-opacity ${
        isClient 
          ? 'border-gray-400 bg-gray-50 dark:bg-gray-700/30' 
          : 'border-green-400 bg-white/10'
      }`}
    >
      <div className={`text-xs font-semibold ${
        isClient ? 'text-green-600 dark:text-green-400' : 'text-green-300'
      }`}>
        {quotedSenderName}
      </div>
      <div className={`text-xs mt-0.5 ${
        isClient ? 'text-gray-600 dark:text-gray-400' : 'text-white/70'
      }`}>
        {contentPreview}
      </div>
    </div>
  );
}

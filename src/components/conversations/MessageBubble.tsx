import { memo, useState } from 'react';
import { Bot, Loader2, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AudioPlayer } from './AudioPlayer';
import { MessageStatus } from './MessageStatus';
import { MessageActions } from './MessageActions';
import { MessageReactions } from './MessageReactions';
import { DocumentPreview } from './DocumentPreview';
import { ContactCard } from './ContactCard';
import { LocationMessage } from './LocationMessage';
import { SecureImage, SecureVideo, SecureAudioSource, SecureDocumentUrl } from './SecureMedia';
import { QuotedMessagePreview } from './QuotedMessagePreview';
import { formatMessageTime } from '@/lib/utils';
import { renderTextWithLinks } from '@/lib/linkify';
import { getInitials, type Message, type Client, type QuotedMessage } from './types';
import type { Reaction } from '@/hooks/useMessageReactions';

interface MessageBubbleProps {
  message: Message;
  isClient: boolean;
  isAI: boolean;
  isFirstInGroup: boolean;
  client: Client | null;
  quotedMessage: QuotedMessage | undefined;
  reactions?: Reaction[];
  onScrollToMessage: (messageId: string) => void;
  onSetSelectedImage: (url: string) => void;
  onReply: (message: Message) => void;
  onDelete: (messageId: string) => void;
  onReact: (messageId: string, emoji: string) => void;
  onRemoveReaction?: (messageId: string) => void;
  onForward?: (message: Message) => void;
  onTranscribe: (messageId: string) => void;
  isTranscribing: boolean;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isClient,
  isAI,
  isFirstInGroup,
  client,
  quotedMessage,
  reactions,
  onScrollToMessage,
  onSetSelectedImage,
  onReply,
  onDelete,
  onReact,
  onRemoveReaction,
  onForward,
  onTranscribe,
  isTranscribing,
}: MessageBubbleProps) {
  const msg = message;
  const [showTranscription, setShowTranscription] = useState(false);

  const clientName = client
    ? `${client.first_name} ${client.last_name || ''}`.trim()
    : 'Cliente';

  const meta = (msg.metadata as any) || {};
  const storedTranscription: string | null =
    meta.transcription ||
    (meta.transcribed && msg.message_text && !['🎤 Áudio', '[Áudio]', '[Media]'].includes(msg.message_text)
      ? msg.message_text
      : null);

  const isAudioMessage = (msg.message_type === 'audio' || msg.message_type === 'ptt') && !!msg.media_url;

  const handleTranscribeClick = () => {
    if (storedTranscription) {
      setShowTranscription((v) => !v);
      return;
    }
    onTranscribe(msg.id);
    setShowTranscription(true);
  };

  return (
    <div
      data-message-id={msg.id}
      className={`flex items-end gap-2 ${
        isClient ? 'justify-start' : 'justify-end'
      }`}
    >
      {/* Avatar do cliente (esquerda) - só na primeira do grupo */}
      {isClient && isFirstInGroup && (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={client?.avatar_url || undefined} alt={clientName} />
          <AvatarFallback className="text-xs">
            {getInitials(clientName)}
          </AvatarFallback>
        </Avatar>
      )}
      
      {/* Espaçador para alinhar mensagens agrupadas do cliente */}
      {isClient && !isFirstInGroup && <div className="w-8 shrink-0" />}
      
      {/* Container da mensagem */}
      <div className={`flex flex-col ${
        !isClient ? 'items-end' : 'items-start'
      } max-w-[65%]`}>
        {/* Nome do remetente - só na primeira do grupo */}
        {isFirstInGroup && (
          <span className="text-[11px] mb-0.5 px-1 text-muted-foreground/80 font-medium">
            {isClient
              ? clientName
              : isAI
                ? 'Assistente IA'
                : (msg.sender as any)?.full_name || 'Agente'
            }
          </span>
        )}

        {/* Bolha da mensagem */}
        <div className={`flex items-center gap-1.5 ${
          !isClient ? 'self-end flex-row-reverse' : 'self-start'
        }`}>
          <div
            className={`relative rounded-lg px-[9px] py-[6px] shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] ${
              isClient
                ? `bg-white dark:bg-[#202c33] text-foreground ${
                    isFirstInGroup ? 'rounded-tl-none' : ''
                  }`
                : `bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-white ${
                    isFirstInGroup ? 'rounded-tr-none' : ''
                  }`
            }`}
          >
            {/* Preview da mensagem citada */}
            {msg.quoted_message_id && quotedMessage && (
              <QuotedMessagePreview
                quotedMessage={quotedMessage}
                isClient={isClient}
                client={client}
                onScrollToMessage={onScrollToMessage}
              />
            )}
            
            {/* Conteúdo da mensagem */}
            {msg.message_type === 'image' && msg.media_url ? (
              <div className="space-y-2">
                <SecureImage
                  src={msg.media_url || ''}
                  alt="Imagem enviada"
                  className="max-w-sm max-h-96 w-auto h-auto rounded-lg object-contain cursor-pointer hover:opacity-90 transition-opacity"
                  loading="lazy"
                  onClick={() => onSetSelectedImage(msg.media_url || '')}
                />
                {msg.message_text && msg.message_text !== '[Media]' && (
                  <p className="text-sm">{msg.message_text}</p>
                )}
              </div>
            ) : isAudioMessage ? (
              <div className="space-y-2">
                <SecureAudioSource src={msg.media_url!}>
                  {(signedUrl) => signedUrl ? (
                    <AudioPlayer
                      src={signedUrl}
                      isClient={msg.sender_type === 'client'}
                    />
                  ) : null}
                </SecureAudioSource>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto py-1 px-2 text-[11px] opacity-80 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10"
                  onClick={handleTranscribeClick}
                  disabled={isTranscribing && !storedTranscription}
                >
                  {isTranscribing && !storedTranscription ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Transcrevendo...
                    </>
                  ) : (
                    <>
                      <FileText className="h-3 w-3 mr-1" />
                      {showTranscription && storedTranscription ? 'Ocultar transcrição' : 'Ver transcrição'}
                      {storedTranscription ? (
                        showTranscription
                          ? <ChevronUp className="h-3 w-3 ml-1" />
                          : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : null}
                    </>
                  )}
                </Button>

                {showTranscription && storedTranscription && (
                  <div className="mt-1 p-2 rounded text-[12px] leading-[17px] italic bg-black/5 dark:bg-white/10">
                    {storedTranscription}
                  </div>
                )}
              </div>
            ) : msg.message_type === 'video' && msg.media_url ? (
              <div className="space-y-2">
                <SecureVideo
                  src={msg.media_url || ''}
                  className="max-w-sm max-h-96 w-auto h-auto rounded-lg cursor-pointer"
                  onClick={() => onSetSelectedImage(msg.media_url || '')}
                />
                {msg.message_text && msg.message_text !== '[Media]' && (
                  <p className="text-sm">{msg.message_text}</p>
                )}
              </div>
            ) : msg.message_type === 'document' && msg.media_url ? (
              (() => {
                const meta = (msg.metadata as any) || {};
                const urlFileName = (() => {
                  if (!msg.media_url) return null;
                  try {
                    const u = new URL(msg.media_url);
                    const last = u.pathname.split('/').pop();
                    if (last && last.includes('.')) return decodeURIComponent(last);
                  } catch {}
                  return null;
                })();
                const legacyLabels = ['[Media]', '📄 Documento', 'Documento'];
                const textFallback = msg.message_text && !legacyLabels.includes(msg.message_text.trim())
                  ? msg.message_text
                  : null;
                const fileName = meta.docName || urlFileName || textFallback || 'Documento';
                return (
                  <div className="space-y-2">
                    <SecureDocumentUrl src={msg.media_url}>
                      {(signedUrl, isLoading) => (
                        <DocumentPreview
                          fileName={fileName}
                          fileUrl={signedUrl || msg.media_url!}
                          fileSize={meta.fileSize}
                          isClient={isClient}
                        />
                      )}
                    </SecureDocumentUrl>
                    {meta.text && meta.text !== meta.docName && meta.text !== fileName && (
                      <p className="text-sm mt-2">{meta.text}</p>
                    )}
                  </div>
                );
              })()
            ) : msg.message_type === 'sticker' && msg.media_url ? (
              <div className="space-y-1">
                <SecureImage 
                  src={msg.media_url} 
                  alt="Sticker"
                  className="w-32 h-32 object-contain"
                  loading="lazy"
                />
              </div>
            ) : (msg.message_type === 'contact' || msg.message_type === 'vcard') ? (
              <ContactCard
                name={(msg.metadata as any)?.displayName || (msg.metadata as any)?.name}
                phone={(msg.metadata as any)?.phone || (msg.metadata as any)?.waid}
                vcard={(msg.metadata as any)?.vcard}
                metadata={msg.metadata as any}
                isClient={isClient}
              />
            ) : msg.message_type === 'location' ? (
              <LocationMessage
                latitude={(msg.metadata as any)?.latitude || (msg.metadata as any)?.degreesLatitude}
                longitude={(msg.metadata as any)?.longitude || (msg.metadata as any)?.degreesLongitude}
                address={(msg.metadata as any)?.address}
                name={(msg.metadata as any)?.name}
                isClient={isClient}
              />
            ) : (
              (() => {
                const legacyLabels = ['🖼️ Imagem', '🎥 Vídeo', '🎤 Áudio', '📄 Documento', '📍 Localização', '📎 Mídia', '[Media]', '[Áudio]'];
                const text = msg.message_text || '';
                if (!text || legacyLabels.includes(text.trim())) return null;
                return (
                  <p className="text-[14.2px] leading-[19px] whitespace-pre-wrap break-words">
                    {renderTextWithLinks(text)}
                  </p>
                );
              })()
            )}

            {/* Timestamp + Status inline, estilo WhatsApp (flutuante no canto) */}
            <div className="flex items-center justify-end gap-1 mt-0.5 -mb-0.5 -mr-0.5">
              <span className={`text-[10.5px] leading-none ${
                isClient
                  ? 'text-foreground/50'
                  : 'text-[#111b21]/60 dark:text-white/60'
              }`}>
                {formatMessageTime(msg.created_at || new Date().toISOString())}
              </span>

              <MessageStatus
                status={(msg as any).read_status || 'sent'}
                isClient={isClient}
              />
            </div>
          </div>
          
          {/* Menu de ações */}
          <MessageActions
            messageId={msg.id}
            messageText={msg.message_text || ''}
            onReply={() => onReply(msg)}
            onDelete={() => onDelete(msg.id)}
            onReact={(emoji) => onReact(msg.id, emoji)}
            onForward={onForward ? () => onForward(msg) : undefined}
            isClient={isClient}
          />
        </div>
        
        {/* Exibir reações abaixo da mensagem */}
        <MessageReactions messageId={msg.id} reactions={reactions} onRemoveReaction={onRemoveReaction} />
      </div>
      
      {/* Avatar do agente/IA (direita) - só na primeira do grupo */}
      {!isClient && isFirstInGroup && (
        <Avatar className="h-8 w-8 shrink-0">
          {isAI ? (
            <AvatarFallback className="bg-purple-600 text-white text-xs">
              <Bot className="h-4 w-4" />
            </AvatarFallback>
          ) : (
            <>
              <AvatarImage src={(msg.sender as any)?.avatar_url || undefined} />
              <AvatarFallback className="bg-[#005C4B] text-white text-xs">
                {getInitials((msg.sender as any)?.full_name || 'Agente')}
              </AvatarFallback>
            </>
          )}
        </Avatar>
      )}
      
      {/* Espaçador para alinhar mensagens agrupadas do agente */}
      {!isClient && !isFirstInGroup && <div className="w-8 shrink-0" />}
    </div>
  );
});

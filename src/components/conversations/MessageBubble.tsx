import { memo, useState, type MouseEvent } from 'react';
import { Bot, Loader2, FileText, ChevronDown, ChevronUp, AlertCircle, RotateCw } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { formatMessageTime, cn } from '@/lib/utils';
import { renderWhatsAppText } from '@/lib/whatsapp/formatar-texto';
import { getInitials, type Message, type Client, type QuotedMessage } from './types';
import type { Reaction } from '@/hooks/useMessageReactions';
import { useAuth } from '@/hooks/useAuth';
import { useReenviarMensagem } from '@/hooks/useConversations';
import { explicarFalhaEnvio, falhaDaMensagem, mensagemReenviavel } from '@/lib/erros/envio';

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
  // Selecao em massa
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (messageId: string) => void;
  onEnterSelectionMode?: (messageId: string) => void;
}

const ROTULO_MIDIA: Record<string, string> = {
  audio: 'Áudio',
  ptt: 'Áudio',
  image: 'Imagem',
  video: 'Vídeo',
  document: 'Documento',
  sticker: 'Figurinha',
};

const LEGENDAS_AUTOMATICAS = [
  '🖼️ Imagem', '🎥 Vídeo', '🎤 Áudio', '📄 Documento', '📎 Mídia',
  '[Media]', '[Áudio]', '[Audio]', '[Audio - transcricao falhou]',
];

/**
 * Tres estados, nao dois: enquanto o worker ainda tem tentativa,
 * "recuperando..."; quando ele desiste (metadata.media_error), o motivo
 * aparece com um botao de nova tentativa.
 */
function MidiaIndisponivel({ msg }: { msg: Message }) {
  const [tentando, setTentando] = useState(false);
  const [pedidoFeito, setPedidoFeito] = useState(false);

  const meta = (msg.metadata || {}) as Record<string, unknown>;
  const rotulo = ROTULO_MIDIA[msg.message_type || ''] || 'Mídia';
  const erro = typeof meta.media_error === 'string' ? meta.media_error : null;
  const temReferencia = !!msg.uaz_message_id;

  const tentarDeNovo = async () => {
    setTentando(true);
    try {
      const res = await fetch('/api/messages/repair-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: msg.id }),
      });
      if (!res.ok) throw new Error('falhou');
      setPedidoFeito(true);
    } catch {
      setTentando(false);
    }
  };

  const legenda = (msg.message_text || '').trim();
  const mostrarLegenda = legenda && !LEGENDAS_AUTOMATICAS.includes(legenda);

  return (
    <div className="space-y-1 py-1">
      <div className="flex items-center gap-2 text-[13px] italic text-muted-foreground">
        <FileText className="h-4 w-4 shrink-0" />
        <span>
          {rotulo}{' '}
          {erro && !pedidoFeito
            ? 'não pôde ser baixado'
            : temReferencia || pedidoFeito
              ? 'indisponível, recuperando…'
              : 'indisponível'}
        </span>
      </div>

      {erro && !pedidoFeito && (
        <div className="space-y-1">
          <p className="text-[11.5px] leading-snug text-muted-foreground/80 break-words">{erro}</p>
          {temReferencia && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={tentarDeNovo}
              disabled={tentando}
            >
              {tentando && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Tentar de novo
            </Button>
          )}
        </div>
      )}

      {mostrarLegenda && (
        <p className="text-[14.2px] leading-[19px] whitespace-pre-wrap break-words">
          {renderWhatsAppText(legenda)}
        </p>
      )}
    </div>
  );
}

/**
 * Mensagem do restaurante que NAO chegou no WhatsApp. Sem isto a bolha
 * parecia enviada. Diz o motivo e o que fazer em palavras simples e, quando
 * adianta, oferece "Tentar de novo" (reenvia a mesma mensagem). O erro
 * tecnico cru so aparece pro super-admin.
 */
function FalhaDeEnvio({
  msg,
  raw,
  selectionMode,
  onReenviada,
}: {
  msg: Message;
  raw: string;
  selectionMode: boolean;
  onReenviada: () => void;
}) {
  const { isSuperAdmin } = useAuth();
  const reenviar = useReenviarMensagem();
  const falha = explicarFalhaEnvio(raw);
  const podeReenviar =
    falha.podeTentarDeNovo &&
    mensagemReenviavel({ messageType: msg.message_type, messageText: msg.message_text, mediaUrl: msg.media_url });
  // Sem botao, o "o que fazer" e o unico caminho: ja aparece aberto.
  const [mostrarDica, setMostrarDica] = useState(!podeReenviar);

  const tentarDeNovo = (e: MouseEvent) => {
    e.stopPropagation();
    reenviar.mutate(msg.id, {
      onSuccess: (r) => {
        if (r.ok) onReenviada();
      },
    });
  };

  return (
    <div
      role="alert"
      className={cn(
        'mt-1 w-fit max-w-full rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-left text-[12px] leading-snug text-red-900',
        'dark:border-red-900/70 dark:bg-red-950/50 dark:text-red-100',
        selectionMode && 'pointer-events-none',
      )}
    >
      <p className="flex items-start gap-1.5">
        <AlertCircle className="mt-[1px] h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
        <span>
          <span className="font-semibold">Não enviada.</span> {falha.motivo}
        </span>
      </p>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setMostrarDica((v) => !v);
        }}
        aria-expanded={mostrarDica}
        className="mt-1 inline-flex items-center gap-0.5 rounded text-[11.5px] font-medium text-red-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 dark:text-red-300"
      >
        O que fazer?
        {mostrarDica ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {mostrarDica && <p className="mt-0.5 text-[11.5px] text-red-800 dark:text-red-200">{falha.oQueFazer}</p>}

      {podeReenviar && !selectionMode && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1.5 flex h-7 px-2 text-[12px] border-red-300 bg-white text-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-800 dark:bg-transparent dark:text-red-200 dark:hover:bg-red-900/40 dark:hover:text-red-100"
          onClick={tentarDeNovo}
          disabled={reenviar.isPending}
        >
          {reenviar.isPending ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCw className="mr-1 h-3.5 w-3.5" />
          )}
          {reenviar.isPending ? 'Enviando…' : 'Tentar de novo'}
        </Button>
      )}

      {isSuperAdmin && (
        <p
          className="mt-1 break-all font-mono text-[10.5px] text-red-900/70 dark:text-red-200/70"
          title="Erro técnico (só o super-admin vê)"
        >
          {raw}
        </p>
      )}
    </div>
  );
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
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
  onEnterSelectionMode,
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

  // Falha de envio (so mensagem do restaurante: atendente ou IA). Depois de um
  // "Tentar de novo" que deu certo a bolha some com o aviso na hora, mesmo se
  // o tempo real estiver fora; uma falha NOVA (outro failed_at) volta a aparecer.
  const isOptimistic = !!(msg as Message & { _optimistic?: boolean })._optimistic;
  const ehDoRestaurante = msg.sender_type === 'agent' || msg.sender_type === 'ai';
  const falhaCrua = ehDoRestaurante && !isOptimistic ? falhaDaMensagem(msg.metadata, msg.read_status) : null;
  const chaveFalha = falhaCrua ? `${falhaCrua}|${String(meta.failed_at ?? '')}` : null;
  const [falhaSuperada, setFalhaSuperada] = useState<string | null>(null);
  const falhaEnvio = falhaCrua && chaveFalha !== falhaSuperada ? falhaCrua : null;
  const statusEnvio = falhaEnvio
    ? 'failed'
    : msg.read_status && msg.read_status !== 'failed'
      ? msg.read_status
      : 'sent';

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
      onClick={selectionMode && onToggleSelect ? () => onToggleSelect(msg.id) : undefined}
      className={cn(
        'flex items-end gap-2',
        isClient ? 'justify-start' : 'justify-end',
        selectionMode && 'cursor-pointer rounded-lg -mx-2 px-2 py-1 transition-colors hover:bg-muted/50',
        selectionMode && isSelected && 'bg-primary/10 hover:bg-primary/15',
      )}
    >
      {/* Checkbox de selecao em massa */}
      {selectionMode && (
        <Checkbox
          checked={!!isSelected}
          className="self-center shrink-0 pointer-events-none"
        />
      )}

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
        <div className={cn(
          'flex items-center gap-1.5',
          !isClient ? 'self-end flex-row-reverse' : 'self-start',
          selectionMode && 'pointer-events-none',
        )}>
          <div
            className={cn(
              'relative rounded-lg px-[9px] py-[6px] shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]',
              isClient
                ? cn('bg-white dark:bg-[#202c33] text-foreground', isFirstInGroup && 'rounded-tl-none')
                : cn(
                    falhaEnvio
                      ? 'bg-red-50 dark:bg-red-950/40 ring-1 ring-red-300 dark:ring-red-800'
                      : 'bg-[#d9fdd3] dark:bg-[#005c4b]',
                    'text-[#111b21] dark:text-white',
                    isFirstInGroup && 'rounded-tr-none',
                  ),
            )}
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
                  <p className="text-sm whitespace-pre-wrap break-words">{renderWhatsAppText(msg.message_text)}</p>
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
                  <p className="text-sm whitespace-pre-wrap break-words">{renderWhatsAppText(msg.message_text)}</p>
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
            ) : ['audio', 'ptt', 'image', 'video', 'document', 'sticker'].includes(msg.message_type || '') && !msg.media_url && !(msg as any)._optimistic ? (
              // Midia cujo download/upload falhou no worker: sem isto a bolha
              // vinha vazia (so o horario) e parecia que o CRM "comeu" a mensagem.
              <MidiaIndisponivel msg={msg} />
            ) : (
              (() => {
                const legacyLabels = ['🖼️ Imagem', '🎥 Vídeo', '🎤 Áudio', '📄 Documento', '📍 Localização', '📎 Mídia', '[Media]', '[Áudio]', '[Audio - transcricao falhou]'];
                const text = msg.message_text || '';
                if (!text || legacyLabels.includes(text.trim())) return null;
                return (
                  <p className="text-[14.2px] leading-[19px] whitespace-pre-wrap break-words">
                    {renderWhatsAppText(text)}
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
                status={statusEnvio}
                isClient={isClient}
              />
            </div>
          </div>
          
          {/* Menu de ações (oculto no modo seleção) */}
          {!selectionMode && (
            <MessageActions
              messageId={msg.id}
              messageText={msg.message_text || ''}
              onReply={() => onReply(msg)}
              onDelete={() => onDelete(msg.id)}
              onReact={(emoji) => onReact(msg.id, emoji)}
              onForward={onForward ? () => onForward(msg) : undefined}
              onSelect={onEnterSelectionMode ? () => onEnterSelectionMode(msg.id) : undefined}
              isClient={isClient}
            />
          )}
        </div>
        
        {/* Nao chegou no WhatsApp: motivo, o que fazer e "Tentar de novo" */}
        {falhaEnvio && chaveFalha && (
          <FalhaDeEnvio
            key={chaveFalha}
            msg={msg}
            raw={falhaEnvio}
            selectionMode={selectionMode}
            onReenviada={() => setFalhaSuperada(chaveFalha)}
          />
        )}

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

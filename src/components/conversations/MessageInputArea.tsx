import { memo, useRef, useEffect } from 'react';
import { X, Send, Smile, Paperclip, Mic, Loader2, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AudioRecorder } from './AudioRecorder';
import { VideoRecorder } from './VideoRecorder';
import dynamic from 'next/dynamic';
const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });
import type { Message } from './types';

interface MessageInputProps {
  messageText: string;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSendMessage: () => void;
  showEmojiPicker: boolean;
  setShowEmojiPicker: (show: boolean) => void;
  onEmojiSelect: (emojiObject: any) => void;
  showAudioRecorder: boolean;
  setShowAudioRecorder: (show: boolean) => void;
  onSendAudio: (audioBlob: Blob, duration: number) => void;
  showVideoRecorder: boolean;
  setShowVideoRecorder: (show: boolean) => void;
  onSendVideo: (videoBlob: Blob, mimeType: string, duration: number) => void;
  replyToMessage: Message | null;
  onCancelReply: () => void;
  isUploading: boolean;
  isSendingMedia: boolean;
  onFileSelect: (file: File) => void;
}

export const MessageInput = memo(function MessageInput({
  messageText,
  onInputChange,
  onSendMessage,
  showEmojiPicker,
  setShowEmojiPicker,
  onEmojiSelect,
  showAudioRecorder,
  setShowAudioRecorder,
  onSendAudio,
  showVideoRecorder,
  setShowVideoRecorder,
  onSendVideo,
  replyToMessage,
  onCancelReply,
  isUploading,
  isSendingMedia,
  onFileSelect,
}: MessageInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
    e.target.value = '';
  };

  return (
    <div className="border-t border-border bg-background">
      {/* Preview da mensagem sendo respondida */}
      {replyToMessage && (
        <div className="px-4 pt-3 pb-2 bg-muted/30 border-b border-border flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              Respondendo a {replyToMessage.sender_type === 'client' ? 'Cliente' : 'Você'}
            </p>
            <p className="text-sm truncate">
              {replyToMessage.message_text}
            </p>
          </div>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={onCancelReply}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="p-4">
        {showAudioRecorder ? (
          <AudioRecorder
            onSendAudio={onSendAudio}
            onCancel={() => setShowAudioRecorder(false)}
          />
        ) : showVideoRecorder ? (
          <VideoRecorder
            onSendVideo={onSendVideo}
            onCancel={() => setShowVideoRecorder(false)}
          />
        ) : (
          <div className="flex gap-2 items-end">
            {/* Input file invisível */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.csv"
              onChange={handleFileChange}
            />

            {/* Botão de Anexo */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 self-end mb-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isSendingMedia}
            >
              {isUploading || isSendingMedia ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Paperclip className="h-5 w-5" />
              )}
            </Button>

            {/* Botão de Áudio */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 self-end mb-2"
              onClick={() => setShowAudioRecorder(true)}
            >
              <Mic className="h-5 w-5" />
            </Button>

            {/* Botão de Vídeo */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 self-end mb-2"
              onClick={() => setShowVideoRecorder(true)}
              title="Gravar video"
            >
              <Video className="h-5 w-5" />
            </Button>

            {/* Container do Textarea */}
            <div className="flex-1 relative">
              <Textarea
                name="message"
                placeholder="Digite sua mensagem..."
                value={messageText}
                onChange={onInputChange}
                className="min-h-[60px] max-h-[120px] resize-none pr-12"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    onSendMessage();
                  }
                }}
              />
              
              {/* Botão de Emoji (dentro do textarea) */}
              <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 bottom-2 h-8 w-8"
                  >
                    <Smile className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent 
                  side="top" 
                  align="end" 
                  className="w-full p-0 border-0"
                  sideOffset={5}
                >
                  <EmojiPicker
                    onEmojiClick={onEmojiSelect}
                    width="100%"
                    height="400px"
                    searchPlaceholder="Buscar emoji..."
                    previewConfig={{
                      showPreview: false
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <Button 
              onClick={onSendMessage}
              disabled={!messageText.trim()}
              className="self-end shrink-0"
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
});

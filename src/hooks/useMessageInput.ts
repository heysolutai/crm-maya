import { useState, useRef, useCallback } from 'react';
import type { Message } from '@/components/conversations/types';

interface UseMessageInputOptions {
  notifyTyping: () => void;
  stopTyping: () => void;
  notifyTypingDebounced: () => void;
}

export function useMessageInput({
  notifyTyping,
  stopTyping,
  notifyTypingDebounced,
}: UseMessageInputOptions) {
  const [messageText, setMessageText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [showVideoRecorder, setShowVideoRecorder] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setMessageText(e.target.value);

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Notify typing para outros agentes (via Supabase Presence)
    notifyTyping();
    
    // Notificar WhatsApp do cliente que agente está digitando
    notifyTypingDebounced();

    // Stop typing after 2 seconds of inactivity
    const timeout = setTimeout(() => {
      stopTyping();
    }, 2000);

    typingTimeoutRef.current = timeout;
  }, [notifyTyping, stopTyping, notifyTypingDebounced]);

  const handleEmojiSelect = useCallback((emojiObject: any) => {
    setMessageText((prev) => prev + emojiObject.emoji);
    setShowEmojiPicker(false);
  }, []);

  const handleReply = useCallback((message: Message) => {
    setReplyToMessage(message);
    const input = document.querySelector('textarea[name="message"]') as HTMLTextAreaElement;
    input?.focus();
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyToMessage(null);
  }, []);

  const clearInput = useCallback(() => {
    setMessageText('');
    setReplyToMessage(null);
    
    // Parar indicador de digitação
    stopTyping();
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  }, [stopTyping]);

  return {
    messageText,
    setMessageText,
    showEmojiPicker,
    setShowEmojiPicker,
    showAudioRecorder,
    setShowAudioRecorder,
    showVideoRecorder,
    setShowVideoRecorder,
    replyToMessage,
    handleInputChange,
    handleEmojiSelect,
    handleReply,
    handleCancelReply,
    clearInput,
  };
}

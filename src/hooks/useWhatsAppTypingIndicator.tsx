import { useCallback, useRef } from 'react';
import { invokeFn } from '@/lib/supabase-functions-adapter';

export function useWhatsAppTypingIndicator(conversationId: string | null) {
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCallRef = useRef<number>(0);

  const notifyTypingToClient = useCallback(async () => {
    console.log('[TypingWhatsApp] notifyTypingToClient called:', { conversationId });
    
    if (!conversationId) {
      console.warn('[TypingWhatsApp] Missing conversationId');
      return;
    }

    // Debounce: only call API if more than 5 seconds since last call
    const now = Date.now();
    if (now - lastCallRef.current < 5000) {
      console.log('[TypingWhatsApp] Debounce active, skipping');
      return;
    }

    lastCallRef.current = now;
    console.log('[TypingWhatsApp] Sending typing indicator via edge function');

    try {
      const { data, error } = await invokeFn('whatsapp-presence', {
          conversationId,
          presence: 'composing',
          delay: 30000,
        });

      if (error) {
        console.warn('[TypingWhatsApp] Edge function error:', error);
        return;
      }

      if (data?.success) {
        console.log('[TypingWhatsApp] Typing indicator sent successfully!');
      } else {
        console.warn('[TypingWhatsApp] Failed:', data?.error);
      }
    } catch (error) {
      console.error('[TypingWhatsApp] Error calling edge function:', error);
    }
  }, [conversationId]);

  const notifyTypingDebounced = useCallback(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      notifyTypingToClient();
    }, 500);
  }, [notifyTypingToClient]);

  return { notifyTypingToClient, notifyTypingDebounced };
}

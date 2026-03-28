import { useCallback, useRef } from 'react';
import { invokeFn } from '@/lib/api-functions';

export function useWhatsAppTypingIndicator(conversationId: string | null) {
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCallRef = useRef<number>(0);

  const notifyTypingToClient = useCallback(async () => {
    if (!conversationId) return;

    const now = Date.now();
    if (now - lastCallRef.current < 5000) return;

    lastCallRef.current = now;

    try {
      const { data, error } = await invokeFn('whatsapp-presence', {
        conversationId,
        presence: 'composing',
        delay: 30000,
      });

      if (error) {
        console.warn('[TypingWhatsApp] Edge function error:', error);
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

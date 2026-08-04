import { apiFetch } from '@/lib/api/client';
import { useState, useEffect, useCallback } from 'react';
import type { QuotedMessage, Message } from '@/components/conversations/types';

export function useQuotedMessages(messages: Message[] | undefined) {
  const [quotedMessages, setQuotedMessages] = useState<Record<string, QuotedMessage>>({});

  const fetchQuotedMessage = useCallback(async (quotedMessageId: string) => {
    if (quotedMessages[quotedMessageId]) return;

    try {
      const res = await apiFetch(`/api/quoted-messages?uazMessageId=${encodeURIComponent(quotedMessageId)}`);
      if (!res.ok) return;
      const data = await res.json();

      if (data) {
        // Map camelCase response to expected format
        const mapped: QuotedMessage = {
          ...data,
          sender: data.sender || undefined,
        };
        setQuotedMessages(prev => ({ ...prev, [quotedMessageId]: mapped }));
      }
    } catch (err) {
      console.error('Error fetching quoted message:', err);
    }
  }, [quotedMessages]);

  useEffect(() => {
    if (!messages) return;

    messages.forEach(msg => {
      if (msg.quoted_message_id && !quotedMessages[msg.quoted_message_id]) {
        fetchQuotedMessage(msg.quoted_message_id);
      }
    });
  }, [messages, quotedMessages, fetchQuotedMessage]);

  return { quotedMessages };
}

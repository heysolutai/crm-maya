import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { QuotedMessage, Message } from '@/components/conversations/types';

export function useQuotedMessages(messages: Message[] | undefined) {
  const [quotedMessages, setQuotedMessages] = useState<Record<string, QuotedMessage>>({});

  const fetchQuotedMessage = useCallback(async (quotedMessageId: string) => {
    if (quotedMessages[quotedMessageId]) return;
    
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*, sender:users(full_name)')
        .eq('uaz_message_id', quotedMessageId)
        .single();
      
      if (data && !error) {
        setQuotedMessages(prev => ({ ...prev, [quotedMessageId]: data as QuotedMessage }));
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

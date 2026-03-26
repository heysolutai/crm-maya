import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

interface TypingAgent {
  userId: string;
  userName: string;
  timestamp: number;
}

export function useAgentTypingIndicator(
  conversationId: string | null,
  currentUserId: string | null,
  currentUserName: string | null
) {
  const [typingAgents, setTypingAgents] = useState<TypingAgent[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isSubscribedRef = useRef(false);

  // Setup presence channel
  useEffect(() => {
    if (!conversationId || !currentUserId) {
      setTypingAgents([]);
      isSubscribedRef.current = false;
      return;
    }

    console.log('[TypingIndicator] Setting up channel for conversation:', conversationId);

    const presenceChannel = supabase.channel(`conversation:${conversationId}:typing`, {
      config: { presence: { key: currentUserId } },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        console.log('[TypingIndicator] Presence sync:', state);
        const agents: TypingAgent[] = [];

        Object.values(state).forEach((presences: any) => {
          presences.forEach((presence: any) => {
            if (presence.userId !== currentUserId && presence.isTyping) {
              agents.push({
                userId: presence.userId,
                userName: presence.userName || 'Agente',
                timestamp: presence.timestamp || Date.now(),
              });
            }
          });
        });

        setTypingAgents(agents);
      })
      .subscribe((status) => {
        console.log('[TypingIndicator] Subscription status:', status);
        if (status === 'SUBSCRIBED') {
          isSubscribedRef.current = true;
          console.log('[TypingIndicator] Channel subscribed successfully');
        }
      });

    channelRef.current = presenceChannel;

    return () => {
      console.log('[TypingIndicator] Cleaning up channel');
      isSubscribedRef.current = false;
      presenceChannel.unsubscribe();
      supabase.removeChannel(presenceChannel);
      channelRef.current = null;
    };
  }, [conversationId, currentUserId]);

  // Notify typing
  const notifyTyping = useCallback(() => {
    const channel = channelRef.current;
    if (!channel || !currentUserId || !currentUserName || !isSubscribedRef.current) {
      console.log('[TypingIndicator] Cannot notify - not ready:', {
        hasChannel: !!channel,
        hasUserId: !!currentUserId,
        hasUserName: !!currentUserName,
        isSubscribed: isSubscribedRef.current,
      });
      return;
    }

    console.log('[TypingIndicator] Notifying typing for:', currentUserName);
    channel.track({
      userId: currentUserId,
      userName: currentUserName,
      isTyping: true,
      timestamp: Date.now(),
    }).catch((err) => console.warn('[TypingIndicator] Error tracking typing:', err));
  }, [currentUserId, currentUserName]);

  // Stop typing
  const stopTyping = useCallback(() => {
    const channel = channelRef.current;
    if (!channel || !currentUserId || !isSubscribedRef.current) {
      return;
    }

    console.log('[TypingIndicator] Stopping typing for:', currentUserName);
    channel.track({
      userId: currentUserId,
      userName: currentUserName || 'Agente',
      isTyping: false,
      timestamp: Date.now(),
    }).catch((err) => console.warn('[TypingIndicator] Error tracking stop typing:', err));
  }, [currentUserId, currentUserName]);

  return {
    typingAgents,
    notifyTyping,
    stopTyping,
  };
}

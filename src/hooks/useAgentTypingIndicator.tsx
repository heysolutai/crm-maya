import { useEffect, useState, useCallback, useRef } from 'react';

interface TypingAgent {
  userId: string;
  userName: string;
  timestamp: number;
}

/**
 * Agent typing indicator - replaced Supabase realtime presence with polling.
 * For now, typing indicators between agents are disabled (no-op).
 * Will be replaced with SSE in a future update.
 */
export function useAgentTypingIndicator(
  conversationId: string | null,
  currentUserId: string | null,
  currentUserName: string | null
) {
  const [typingAgents, setTypingAgents] = useState<TypingAgent[]>([]);

  // No-op: typing notifications between agents are not supported without realtime
  const notifyTyping = useCallback(() => {
    // Will be implemented with SSE later
  }, []);

  const stopTyping = useCallback(() => {
    // Will be implemented with SSE later
  }, []);

  return {
    typingAgents,
    notifyTyping,
    stopTyping,
  };
}

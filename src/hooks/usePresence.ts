'use client';

import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from './useAuth';
import { invokeFn } from '@/lib/supabase-functions-adapter';
import React from 'react';

interface PresenceContextType {
  onlineUserIds: string[];
  isOnline: boolean;
}

const PresenceContext = createContext<PresenceContextType>({
  onlineUserIds: [],
  isOnline: false,
});

export function usePresenceContext() {
  return useContext(PresenceContext);
}

const HEARTBEAT_INTERVAL = 60_000; // 60 seconds

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user, companyId } = useAuth();
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [isOnline, setIsOnline] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setPresence = useCallback(async (action: 'online' | 'offline' | 'heartbeat') => {
    if (!user?.id) return;
    try {
      await fetch('/api/user/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, user_id: user.id }),
      });
    } catch (e) {
      console.warn('[Presence] Failed to update presence:', action, e);
    }
  }, [user?.id]);

  const pickupQueuedConversations = useCallback(async () => {
    try {
      await invokeFn('pickup-queue', {});
    } catch (e) {
      console.warn('[Presence] Failed to pick up queued conversations:', e);
    }
  }, []);

  useEffect(() => {
    if (!user?.id || !companyId) return;

    const channelName = `company-presence:${companyId}`;

    // Set online
    setPresence('online').then(() => {
      setIsOnline(true);
      pickupQueuedConversations();
    });

    // Join presence channel
    const channel = supabase.channel(channelName, {
      config: { presence: { key: user.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const ids = Object.keys(state);
        setOnlineUserIds(ids);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: user.id, online_at: new Date().toISOString() });
        }
      });

    channelRef.current = channel;

    // Heartbeat
    heartbeatRef.current = setInterval(() => {
      setPresence('heartbeat');
    }, HEARTBEAT_INTERVAL);

    // Handle tab close / navigation away
    const handleBeforeUnload = () => {
      // Use sendBeacon for reliable offline notification
      const payload = JSON.stringify({ action: 'offline', user_id: user.id });
      navigator.sendBeacon('/api/user/presence', payload);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);

      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }

      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      setPresence('offline');
      setIsOnline(false);
    };
  }, [user?.id, companyId, setPresence, pickupQueuedConversations]);

  return React.createElement(
    PresenceContext.Provider,
    { value: { onlineUserIds, isOnline } },
    children
  );
}

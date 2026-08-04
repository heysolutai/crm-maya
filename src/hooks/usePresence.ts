'use client';

import { apiFetch } from '@/lib/api/client';
import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import { useAuth } from './useAuth';
import { invokeFn } from '@/lib/api-functions';
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
const PRESENCE_POLL_INTERVAL = 30_000; // 30 seconds

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user, companyId } = useAuth();
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [isOnline, setIsOnline] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setPresence = useCallback(async (action: 'online' | 'offline' | 'heartbeat') => {
    if (!user?.id) return;
    try {
      await apiFetch('/api/user/presence', {
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

  const pollOnlineUsers = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await apiFetch(`/api/presence-poll?companyId=${companyId}`);
      if (res.ok) {
        const data = await res.json();
        setOnlineUserIds(data.onlineUserIds || []);
      }
    } catch (e) {
      console.warn('[Presence] Failed to poll online users:', e);
    }
  }, [companyId]);

  useEffect(() => {
    if (!user?.id || !companyId) return;

    // Set online
    setPresence('online').then(() => {
      setIsOnline(true);
      pickupQueuedConversations();
    });

    // Poll for online users (replaces Supabase presence channel)
    pollOnlineUsers();
    pollRef.current = setInterval(pollOnlineUsers, PRESENCE_POLL_INTERVAL);

    // Heartbeat
    heartbeatRef.current = setInterval(() => {
      setPresence('heartbeat');
    }, HEARTBEAT_INTERVAL);

    // Handle tab close / navigation away
    const handleBeforeUnload = () => {
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

      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }

      setPresence('offline');
      setIsOnline(false);
    };
  }, [user?.id, companyId, setPresence, pickupQueuedConversations, pollOnlineUsers]);

  return React.createElement(
    PresenceContext.Provider,
    { value: { onlineUserIds, isOnline } },
    children
  );
}

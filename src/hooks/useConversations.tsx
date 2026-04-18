import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeFn } from '@/lib/api-functions';
import { useAuth } from './useAuth';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { useUserPermissions } from './useUserPermissions';
import { useToast } from './use-toast';
import { useEffect, useState, useRef } from 'react';
import { getErrorMessage } from '@/utils/getErrorMessage';

export type ConversationFilters = {
  search?: string;
  status?: string;
  aiHandled?: boolean;
  startDate?: string;
  endDate?: string;
  tags?: string[];
  departmentId?: string;
};

export function useConversations(filters?: ConversationFilters) {
  const { user, role } = useAuth();
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const { permissions } = useUserPermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [realtimeStatus, setRealtimeStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected');
  const [usePolling] = useState(true); // Always use polling now

  const [conversationMessages, setConversationMessages] = useState<{
    [conversationId: string]: {
      messages: any[];
      hasMore: boolean;
      isLoading: boolean;
      oldestCursor: string | null;
      initialLoaded: boolean;
    }
  }>({});

  const pollingIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Normalize message from camelCase (Prisma) to snake_case (frontend Message type)
  const normalizeMessage = (m: any) => ({
    ...m,
    id: m.id,
    conversation_id: m.conversationId || m.conversation_id,
    message_text: m.messageText ?? m.message_text ?? null,
    message_type: m.messageType || m.message_type || 'text',
    sender_type: m.senderType || m.sender_type || 'client',
    sender_id: m.senderId || m.sender_id || null,
    media_url: m.mediaUrl || m.media_url || null,
    is_read: m.isRead ?? m.is_read ?? false,
    read_at: m.readAt || m.read_at || null,
    read_status: m.readStatus || m.read_status || null,
    quoted_message_id: m.quotedMessageId || m.quoted_message_id || null,
    uaz_message_id: m.uazMessageId || m.uaz_message_id || null,
    created_at: m.createdAt || m.created_at || null,
    metadata: m.metadata || null,
    sender: m.sender ? {
      full_name: m.sender.fullName || m.sender.full_name || null,
      avatar_url: m.sender.avatarUrl || m.sender.avatar_url || null,
    } : null,
    // Keep _optimistic flag if present
    _optimistic: m._optimistic || false,
  });

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations', companyId, filters],
    queryFn: async () => {
      if (!companyId) return [];

      const params = new URLSearchParams({ companyId });

      // If not admin/manager AND cannot see all conversations, filter by assigned
      if (role && !['super_admin', 'company_admin', 'manager'].includes(role) &&
          permissions.conversation_access !== 'all' && user?.id) {
        params.set('assignedTo', user.id);
      }

      if (filters?.status) params.set('status', filters.status);
      if (filters?.aiHandled !== undefined) params.set('aiHandled', String(filters.aiHandled));
      if (filters?.startDate) params.set('startDate', filters.startDate);
      if (filters?.endDate) params.set('endDate', filters.endDate);
      if (filters?.departmentId) params.set('departmentId', filters.departmentId);

      const res = await fetch(`/api/conversations?${params}`);
      if (!res.ok) throw new Error('Failed to fetch conversations');
      let results = await res.json();

      // Filter by tags and search on client side
      if (filters?.search && filters.search.trim()) {
        const searchTerm = filters.search.trim().toLowerCase();
        results = results.filter((conv: any) => {
          const clientName = `${conv.client?.firstName || conv.client?.first_name || ''} ${conv.client?.lastName || conv.client?.last_name || ''}`.toLowerCase();
          const phone = conv.client?.phone || '';
          return clientName.includes(searchTerm) || phone.includes(searchTerm);
        });
      }

      if (filters?.tags && filters.tags.length > 0) {
        results = results.filter((conv: any) =>
          filters.tags?.some((tag) => conv.tags?.includes(tag))
        );
      }

      // Fetch unread counts
      const conversationIds = results.map((c: any) => c.id);
      const countMap: Record<string, number> = {};

      if (conversationIds.length > 0) {
        try {
          const unreadRes = await fetch(`/api/unread-messages?conversationIds=${conversationIds.join(',')}`);
          if (unreadRes.ok) {
            const unreadData = await unreadRes.json();
            Object.assign(countMap, unreadData);
          }
        } catch { /* ignore */ }
      }

      results = results.map((conv: any) => {
        const lastMsg = conv.messages?.[0] || null;
        // Normalize client fields from camelCase (Prisma) to snake_case (frontend types)
        const client = conv.client ? {
          id: conv.client.id,
          first_name: conv.client.firstName || conv.client.first_name || '',
          last_name: conv.client.lastName || conv.client.last_name || null,
          phone: conv.client.phone || null,
          email: conv.client.email || null,
          avatar_url: conv.client.avatarUrl || conv.client.avatar_url || null,
          ai_paused: conv.client.aiPaused ?? conv.client.ai_paused ?? false,
        } : null;
        // Normalize transferAgent → transferred_user
        const transferred_user = conv.transferAgent
          ? { full_name: conv.transferAgent.fullName || conv.transferAgent.full_name || null }
          : (conv.transferred_user || null);
        return {
          ...conv,
          client,
          started_at: conv.startedAt || conv.started_at,
          transferred_user,
          unread_count: countMap[conv.id] || 0,
          last_message: lastMsg ? {
            text: lastMsg.messageText || lastMsg.message_text,
            type: lastMsg.messageType || lastMsg.message_type,
            sender_type: lastMsg.senderType || lastMsg.sender_type,
            created_at: lastMsg.createdAt || lastMsg.created_at,
          } : null,
        };
      });

      return results;
    },
    enabled: !!companyId,
    staleTime: 30000,
  });

  // Fetch messages for a conversation
  const fetchMessagesForConversation = async (conversationId: string, cursor?: string, limit = 50) => {
    const params = new URLSearchParams({ conversationId, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`/api/messages?${params}`);
    if (!res.ok) throw new Error('Failed to fetch messages');
    return await res.json();
  };

  // Load initial messages
  const loadInitialMessages = async (conversationId: string) => {
    const state = conversationMessages[conversationId];
    if (state?.initialLoaded || state?.isLoading) return;

    setConversationMessages(prev => ({
      ...prev,
      [conversationId]: {
        messages: [], hasMore: true, isLoading: true, oldestCursor: null, initialLoaded: false,
      }
    }));

    try {
      const data = await fetchMessagesForConversation(conversationId);
      const reversedData = [...data].map(normalizeMessage).reverse();

      setConversationMessages(prev => ({
        ...prev,
        [conversationId]: {
          messages: reversedData,
          hasMore: data.length === 50,
          isLoading: false,
          oldestCursor: data.length > 0 ? (data[data.length - 1].createdAt || data[data.length - 1].created_at) : null,
          initialLoaded: true,
        }
      }));
    } catch (error) {
      console.error('[Messages] Error loading initial messages:', error);
      setConversationMessages(prev => ({
        ...prev,
        [conversationId]: {
          messages: [], hasMore: false, isLoading: false, oldestCursor: null, initialLoaded: true,
        }
      }));
    }
  };

  // Realtime via Server-Sent Events (push do backend -> frontend).
  // O polling de fallback continua rodando em intervalo maior, pra casos de
  // desconexao do SSE ou mensagens perdidas durante um reconnect.
  useEffect(() => {
    if (!companyId) return;

    setRealtimeStatus('connecting');
    const es = new EventSource('/api/conversations/events');

    es.addEventListener('open', () => {
      console.log('[SSE] conectado');
      setRealtimeStatus('connected');
    });

    es.addEventListener('connected', (evt: MessageEvent) => {
      console.log('[SSE] handshake:', evt.data);
    });

    es.addEventListener('message', (evt: MessageEvent) => {
      console.log('[SSE] evento recebido:', evt.data);
      try {
        const data = JSON.parse(evt.data);

        if (data.type === 'message:new' && data.conversationId && data.message) {
          const incoming = normalizeMessage(data.message);
          setConversationMessages(prev => {
            const state = prev[data.conversationId];
            if (!state?.initialLoaded) return prev;
            if (state.messages.some(m => m.id === incoming.id)) return prev;
            const merged = [...state.messages.filter(m => !m._optimistic), incoming]
              .sort((a, b) => new Date(a.createdAt || a.created_at).getTime() - new Date(b.createdAt || b.created_at).getTime());
            return { ...prev, [data.conversationId]: { ...state, messages: merged } };
          });
          queryClient.invalidateQueries({ queryKey: ['conversations', companyId] });
          return;
        }

        if (data.type === 'message:delete' && data.conversationId && data.messageId) {
          setConversationMessages(prev => {
            const state = prev[data.conversationId];
            if (!state) return prev;
            return {
              ...prev,
              [data.conversationId]: {
                ...state,
                messages: state.messages.filter(m => m.id !== data.messageId),
              },
            };
          });
          queryClient.invalidateQueries({ queryKey: ['conversations', companyId] });
          return;
        }

        if (data.type === 'message:update' && data.conversationId && data.messageId && data.patch) {
          const patch = data.patch as Record<string, any>;
          setConversationMessages(prev => {
            const state = prev[data.conversationId];
            if (!state) return prev;
            return {
              ...prev,
              [data.conversationId]: {
                ...state,
                messages: state.messages.map(m =>
                  m.id === data.messageId
                    ? {
                        ...m,
                        ...patch,
                        read_status: patch.readStatus ?? m.read_status,
                        read_at: patch.readAt ?? m.read_at,
                      }
                    : m
                ),
              },
            };
          });
          return;
        }
      } catch (err) {
        console.warn('[SSE] parse error:', err);
      }
    });

    es.addEventListener('error', () => {
      // O browser reconecta sozinho; so logamos
      console.warn('[SSE] conexao caiu, reconectando...');
      setRealtimeStatus('disconnected');
    });

    // Polling de fallback (intervalo maior, so pra cobrir buracos de SSE)
    pollingIntervalRef.current = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['conversations', companyId] });
    }, 15_000);

    return () => {
      es.close();
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [companyId, queryClient]);

  // Manual refresh
  const manualRefresh = async () => {
    queryClient.invalidateQueries({ queryKey: ['conversations', companyId] });

    Object.keys(conversationMessages).forEach(convId => {
      setConversationMessages(prev => ({
        ...prev,
        [convId]: { ...prev[convId], initialLoaded: false }
      }));
    });

    toast({ title: 'Conversas atualizadas' });
  };

  const getConversationMessages = (conversationId: string) => {
    return conversationMessages[conversationId]?.messages || [];
  };

  const getUnreadCount = (conversationId: string) => {
    const now = new Date();
    const timeLimit = new Date(now.getTime() - (48 * 60 * 60 * 1000));
    const convMessages = conversationMessages[conversationId]?.messages || [];

    const lastAgentMessage = convMessages
      .filter(m => m.sender_type === 'agent' || m.senderType === 'agent' || m.sender_type === 'ai' || m.senderType === 'ai')
      .sort((a, b) => new Date(b.created_at || b.createdAt).getTime() - new Date(a.created_at || a.createdAt).getTime())[0];

    const lastAgentTime = lastAgentMessage?.created_at || lastAgentMessage?.createdAt;

    const unreadMessages = convMessages.filter(m => {
      const senderType = m.sender_type || m.senderType;
      const isRead = m.is_read ?? m.isRead;
      if (senderType !== 'client' || isRead !== false) return false;

      const messageTime = new Date(m.created_at || m.createdAt);
      if (messageTime < timeLimit) return false;
      if (lastAgentTime && messageTime <= new Date(lastAgentTime)) return false;

      return true;
    });

    return unreadMessages.length;
  };

  // Load older messages (infinite scroll)
  const loadOlderMessages = async (conversationId: string): Promise<number> => {
    const state = conversationMessages[conversationId];
    if (!state || !state.hasMore || state.isLoading) return 0;

    setConversationMessages(prev => ({
      ...prev,
      [conversationId]: { ...prev[conversationId], isLoading: true }
    }));

    try {
      const data = await fetchMessagesForConversation(conversationId, state.oldestCursor || undefined);
      const reversedData = [...data].map(normalizeMessage).reverse();

      setConversationMessages(prev => ({
        ...prev,
        [conversationId]: {
          messages: [...reversedData, ...prev[conversationId].messages],
          hasMore: data.length === 50,
          isLoading: false,
          oldestCursor: data.length > 0 ? (data[data.length - 1].createdAt || data[data.length - 1].created_at) : prev[conversationId].oldestCursor,
          initialLoaded: true,
        }
      }));

      return reversedData.length;
    } catch (error) {
      console.error('[Messages] Error loading older messages:', error);
      setConversationMessages(prev => ({
        ...prev,
        [conversationId]: { ...prev[conversationId], isLoading: false }
      }));
      return 0;
    }
  };

  const addMessageToConversation = (conversationId: string, message: any) => {
    setConversationMessages(prev => {
      const state = prev[conversationId];
      if (!state) return prev;
      if (state.messages.some(m => m.id === message.id)) return prev;
      return {
        ...prev,
        [conversationId]: { ...state, messages: [...state.messages, message] },
      };
    });
  };

  const updateMessageInConversation = (conversationId: string, messageId: string, updates: any) => {
    setConversationMessages(prev => {
      const state = prev[conversationId];
      if (!state) return prev;
      return {
        ...prev,
        [conversationId]: {
          ...state,
          messages: state.messages.map(m => m.id === messageId ? { ...m, ...updates } : m),
        },
      };
    });
  };

  const updateConversation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const res = await fetch('/api/conversations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update conversation');
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({ title: 'Conversa atualizada com sucesso' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao atualizar conversa', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const transferConversation = useMutation({
    mutationFn: async ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      const res = await fetch('/api/conversations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: conversationId,
          transferredTo: userId,
          status: 'active',
          aiHandled: false,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to transfer conversation');
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({ title: 'Conversa transferida com sucesso' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao transferir conversa', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const transferToDepartment = useMutation({
    mutationFn: async ({ conversationId, departmentId }: { conversationId: string; departmentId: string }) => {
      const { data, error } = await invokeFn('transfer-conversation', {
        conversation_id: conversationId,
        department_id: departmentId,
        mode: 'department',
      });
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (data?.queued) {
        toast({
          title: 'Conversa na fila',
          description: `Nenhum agente online no departamento "${data.department?.name}". Conversa aguardando.`,
        });
      } else {
        toast({ title: 'Conversa transferida com sucesso' });
      }
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao transferir conversa', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const pickupConversation = useMutation({
    mutationFn: async (conversationId: string) => {
      const res = await fetch("/api/messaging/pickup-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Erro ao pegar conversa");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast({ title: "Conversa atribuída a você" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const closeConversation = useMutation({
    mutationFn: async (conversationId: string) => {
      const res = await fetch('/api/conversations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: conversationId,
          status: 'closed',
          endedAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to close conversation');
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({ title: 'Conversa encerrada com sucesso' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao encerrar conversa', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const addTag = useMutation({
    mutationFn: async ({ conversationId, tag }: { conversationId: string; tag: string }) => {
      const conversation = conversations?.find((c: any) => c.id === conversationId);
      const currentTags = conversation?.tags || [];

      const res = await fetch('/api/conversations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: conversationId,
          tags: [...currentTags, tag],
          updatedAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to add tag');
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({ title: 'Etiqueta adicionada com sucesso' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao adicionar etiqueta', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const removeTag = useMutation({
    mutationFn: async ({ conversationId, tag }: { conversationId: string; tag: string }) => {
      const conversation = conversations?.find((c: any) => c.id === conversationId);
      const currentTags = conversation?.tags || [];

      const res = await fetch('/api/conversations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: conversationId,
          tags: currentTags.filter((t: string) => t !== tag),
          updatedAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to remove tag');
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({ title: 'Etiqueta removida com sucesso' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao remover etiqueta', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const reopenConversation = useMutation({
    mutationFn: async (conversationId: string) => {
      const res = await fetch('/api/conversations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: conversationId,
          status: 'active',
          endedAt: null,
          updatedAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to reopen conversation');
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({ title: 'Conversa reaberta com sucesso' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao reabrir conversa', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const sendMessage = useMutation({
    mutationFn: async ({
      conversationId,
      messageText,
      phone,
      replyToMessageId
    }: {
      conversationId: string;
      messageText: string;
      phone?: string;
      replyToMessageId?: string;
    }) => {
      const payload: any = { message: messageText, conversationId };
      if (phone) payload.phone = phone;
      if (replyToMessageId) payload.replyToMessageId = replyToMessageId;

      const { data, error } = await invokeFn('send-message-text', payload);
      if (error) throw error;
      return data;
    },
    onMutate: async ({ conversationId, messageText }) => {
      const optimisticMessage = {
        id: `temp-${Date.now()}`,
        conversation_id: conversationId,
        conversationId,
        sender_type: 'agent',
        senderType: 'agent',
        sender_id: user?.id || null,
        senderId: user?.id || null,
        message_text: messageText,
        messageText,
        message_type: 'text',
        messageType: 'text',
        is_read: false,
        isRead: false,
        created_at: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        metadata: {},
        _optimistic: true,
      };

      setConversationMessages(prev => {
        const state = prev[conversationId];
        if (!state) return prev;
        return {
          ...prev,
          [conversationId]: { ...state, messages: [...state.messages, optimisticMessage] },
        };
      });

      return { conversationId, optimisticId: optimisticMessage.id };
    },
    onError: (error: any, variables) => {
      setConversationMessages(prev => {
        const state = prev[variables.conversationId];
        if (!state) return prev;
        return {
          ...prev,
          [variables.conversationId]: {
            ...state,
            messages: state.messages.filter(m => !m._optimistic),
          },
        };
      });
      toast({ title: 'Erro ao enviar mensagem', description: getErrorMessage(error), variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const sendAudioMessage = useMutation({
    mutationFn: async ({
      conversationId,
      audioBlob,
      duration
    }: {
      conversationId: string;
      audioBlob: Blob;
      duration: number
    }) => {
      const reader = new FileReader();
      const audioBase64 = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      const { data, error } = await invokeFn('send-audio-message', {
        conversationId, audioBase64, duration, mimeType: audioBlob.type,
      });
      if (error) throw error;
      return data;
    },
    onMutate: async ({ conversationId }) => {
      const optimisticMessage = {
        id: `temp-audio-${Date.now()}`,
        conversationId,
        senderType: 'agent',
        senderId: user?.id || null,
        messageText: 'Enviando áudio...',
        messageType: 'audio',
        isRead: false,
        createdAt: new Date().toISOString(),
        _optimistic: true,
      };

      setConversationMessages(prev => {
        const state = prev[conversationId];
        if (!state) return prev;
        return {
          ...prev,
          [conversationId]: { ...state, messages: [...state.messages, optimisticMessage] },
        };
      });

      return { conversationId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error: any, variables) => {
      setConversationMessages(prev => {
        const state = prev[variables.conversationId];
        if (!state) return prev;
        return {
          ...prev,
          [variables.conversationId]: {
            ...state,
            messages: state.messages.filter(m => !m._optimistic),
          },
        };
      });
      toast({ title: 'Erro ao enviar áudio', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const deleteMessage = useMutation({
    mutationFn: async ({ messageId, conversationId }: { messageId: string; conversationId: string }) => {
      // Chama o endpoint que revoga no WhatsApp (via UazAPI /message/delete) e deleta do banco
      const res = await fetch('/api/whatsapp/delete-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete message');
      }
      return { messageId, conversationId };
    },
    onSuccess: ({ messageId, conversationId }) => {
      setConversationMessages(prev => {
        const state = prev[conversationId];
        if (!state) return prev;
        return {
          ...prev,
          [conversationId]: {
            ...state,
            messages: state.messages.filter(m => m.id !== messageId),
          },
        };
      });
      toast({ title: "Mensagem apagada", description: "A mensagem foi removida com sucesso." });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao apagar mensagem', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const transcribeMessage = useMutation({
    mutationFn: async ({ messageId, conversationId }: { messageId: string; conversationId: string }) => {
      const { data, error } = await invokeFn('transcribe-audio', { messageId });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Transcription failed');
      return { messageId, conversationId, transcription: data.transcription, cached: data.cached };
    },
    onSuccess: (data) => {
      setConversationMessages(prev => {
        const state = prev[data.conversationId];
        if (!state) return prev;
        return {
          ...prev,
          [data.conversationId]: {
            ...state,
            messages: state.messages.map(m =>
              m.id === data.messageId
                ? {
                    ...m,
                    metadata: {
                      ...((m.metadata as any) || {}),
                      transcription: data.transcription,
                      transcribed: true,
                    },
                  }
                : m
            ),
          },
        };
      });
      toast({
        title: data.cached ? 'Transcrição carregada' : 'Áudio transcrito com sucesso',
        description: data.cached ? 'Transcrição já estava disponível' : 'A transcrição foi adicionada à mensagem',
      });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao transcrever áudio', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const sendMediaMessage = useMutation({
    mutationFn: async ({
      conversationId, fileUrl, fileName, fileSize, mimeType, mediaType = 'document'
    }: {
      conversationId: string; fileUrl: string; fileName: string;
      fileSize: number; mimeType: string; mediaType?: 'image' | 'video' | 'document' | 'audio';
    }) => {
      const conversation = conversations?.find((c: any) => c.id === conversationId);
      if (!conversation?.client?.phone) throw new Error('Telefone do cliente não encontrado');

      const { data, error } = await invokeFn('send-message-media', {
        phone: conversation.client.phone,
        type: mediaType,
        file: fileUrl,
        text: mediaType === 'document' ? fileName : undefined,
        docName: mediaType === 'document' ? fileName : undefined,
        fileSize, mimeType, conversationId, fromAI: false,
      });
      if (error) throw error;
      return data;
    },
    onMutate: async ({ conversationId, mediaType, fileName }) => {
      const typeLabels: Record<string, string> = {
        image: 'Enviando imagem...',
        video: 'Enviando vídeo...',
        document: `Enviando ${fileName}...`,
      };

      const optimisticMessage = {
        id: `temp-media-${Date.now()}`,
        conversationId,
        senderType: 'agent',
        senderId: user?.id || null,
        messageText: typeLabels[mediaType || 'document'],
        messageType: mediaType || 'document',
        isRead: false,
        createdAt: new Date().toISOString(),
        _optimistic: true,
      };

      setConversationMessages(prev => {
        const state = prev[conversationId];
        if (!state) return prev;
        return {
          ...prev,
          [conversationId]: { ...state, messages: [...state.messages, optimisticMessage] },
        };
      });

      return { conversationId };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      const typeLabels: Record<string, string> = { image: 'Imagem enviada', video: 'Vídeo enviado', document: 'Documento enviado' };
      toast({
        title: typeLabels[variables.mediaType || 'document'] || 'Mídia enviada',
        description: 'Arquivo enviado com sucesso.',
      });
    },
    onError: (error: any, variables) => {
      setConversationMessages(prev => {
        const state = prev[variables.conversationId];
        if (!state) return prev;
        return {
          ...prev,
          [variables.conversationId]: {
            ...state,
            messages: state.messages.filter(m => !m._optimistic),
          },
        };
      });
      toast({ title: 'Erro ao enviar mídia', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  // Forward message to another conversation
  const forwardMessage = useMutation({
    mutationFn: async ({
      message,
      targetConversationId,
    }: {
      message: any;
      targetConversationId: string;
    }) => {
      const target = conversations?.find((c: any) => c.id === targetConversationId);
      if (!target?.client?.phone) throw new Error('Conversa destino invalida');

      const mediaType = (message.message_type || message.messageType || 'text') as string;
      const mediaUrl = message.media_url || message.mediaUrl;
      const messageText = message.message_text || message.messageText || '';

      // Texto puro
      if (!mediaUrl || mediaType === 'text') {
        if (!messageText.trim()) throw new Error('Mensagem vazia');
        const { data, error } = await invokeFn('send-message-text', {
          conversationId: targetConversationId,
          message: messageText,
          phone: target.client.phone,
        });
        if (error) throw error;
        return data;
      }

      // Audio/ptt: send-media nao aceita esses tipos diretamente
      if (['audio', 'ptt'].includes(mediaType)) {
        throw new Error('Encaminhamento de audio ainda nao suportado');
      }

      // Midia (image / video / document / sticker): manda o URL direto
      // O backend send-media faz fetch(url) e converte pra base64
      const forwardType: 'image' | 'video' | 'document' =
        mediaType === 'image' ? 'image' :
        mediaType === 'video' ? 'video' : 'document';

      const docName = (message.metadata as any)?.docName || (message.metadata as any)?.fileName;

      const { data, error } = await invokeFn('send-message-media', {
        phone: target.client.phone,
        type: forwardType,
        file: mediaUrl,
        text: messageText || undefined,
        docName: forwardType === 'document' ? docName : undefined,
        conversationId: targetConversationId,
        fromAI: false,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({ title: 'Mensagem encaminhada', description: 'Enviada com sucesso.' });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao encaminhar',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  // Toggle AI paused for client
  const toggleClientAIPaused = useMutation({
    mutationFn: async ({ clientId, currentValue }: { clientId: string; currentValue: boolean }) => {
      const res = await fetch('/api/clients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: clientId, aiPaused: !currentValue }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to toggle AI');
      }
      return !currentValue;
    },
    onSuccess: (newValue) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({
        title: newValue ? 'IA pausada' : 'IA ativada',
        description: newValue
          ? 'A IA não responderá automaticamente para este cliente'
          : 'A IA voltou a responder automaticamente',
      });
    },
    onError: () => {
      toast({ title: 'Erro', description: 'Não foi possível alterar o status da IA', variant: 'destructive' });
    }
  });

  const sendDocumentMessage = {
    mutate: (params: { conversationId: string; fileUrl: string; fileName: string; fileSize: number; mimeType: string }) =>
      sendMediaMessage.mutate({ ...params, mediaType: 'document' }),
    isPending: sendMediaMessage.isPending,
  };

  return {
    conversations,
    isLoading,
    getConversationMessages,
    getUnreadCount,
    loadOlderMessages,
    loadInitialMessages,
    conversationMessages,
    updateConversation: updateConversation.mutate,
    transferConversation: transferConversation.mutate,
    transferToDepartment: transferToDepartment.mutate,
    pickupConversation: pickupConversation.mutate,
    closeConversation: closeConversation.mutate,
    reopenConversation: reopenConversation.mutate,
    sendMessage: sendMessage.mutate,
    sendAudioMessage,
    sendMediaMessage: sendMediaMessage.mutate,
    sendDocumentMessage: sendDocumentMessage.mutate,
    isSendingMedia: sendMediaMessage.isPending,
    isSendingDocument: sendDocumentMessage.isPending,
    addTag: addTag.mutate,
    removeTag: removeTag.mutate,
    deleteMessage: deleteMessage.mutate,
    forwardMessage: forwardMessage.mutate,
    isForwarding: forwardMessage.isPending,
    transcribeMessage: transcribeMessage.mutate,
    isTranscribing: transcribeMessage.isPending,
    realtimeStatus,
    usePolling,
    manualRefresh,
    addMessageToConversation,
    toggleClientAIPaused: toggleClientAIPaused.mutate,
    isTogglingAIPaused: toggleClientAIPaused.isPending,
  };
}

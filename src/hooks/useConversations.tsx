import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { invokeFn } from '@/lib/supabase-functions-adapter';
import { useAuth } from './useAuth';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { useUserPermissions } from './useUserPermissions';
import { useToast } from './use-toast';
import { useEffect, useState, useRef } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';

export type ConversationFilters = {
  search?: string;
  status?: string;
  aiHandled?: boolean;
  startDate?: string;
  endDate?: string;
  tags?: string[];
};
import { getErrorMessage } from '@/utils/getErrorMessage';

export function useConversations(filters?: ConversationFilters) {
  const { user, role } = useAuth();
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const { permissions } = useUserPermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [realtimeStatus, setRealtimeStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected');
  const [usePolling, setUsePolling] = useState(false);
  
  // Estado para mensagens por conversa com paginação
  const [conversationMessages, setConversationMessages] = useState<{
    [conversationId: string]: {
      messages: any[];
      hasMore: boolean;
      isLoading: boolean;
      oldestCursor: string | null;
      initialLoaded: boolean;
    }
  }>({});
  
  const messagesChannelRef = useRef<RealtimeChannel | null>(null);
  const conversationsChannelRef = useRef<RealtimeChannel | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations', companyId, filters],
    queryFn: async () => {
      if (!companyId) return [];

      let query = supabase
        .from('conversations')
        .select(`
          *,
          client:clients(id, first_name, last_name, phone, email, avatar_url, ai_paused),
          transferred_user:users!conversations_transferred_to_fkey(full_name),
          department:departments!conversations_department_id_fkey(id, name, color),
          messages(message_text, message_type, sender_type, created_at)
        `)
        .eq('company_id', companyId)
        .order('updated_at', { ascending: false })
        .order('started_at', { ascending: false })
        .order('created_at', { referencedTable: 'messages', ascending: false })
        .limit(1, { referencedTable: 'messages' });

      // Se não for admin/manager E não pode ver todas conversas, filtrar por transferido
      if (role && !['super_admin', 'company_admin', 'manager'].includes(role) && 
          permissions.conversation_access !== 'all' && user?.id) {
        query = query.eq('transferred_to', user.id);
      }

      if (filters?.status) {
        query = query.eq('status', filters.status as any);
      }
      if (filters?.aiHandled !== undefined) {
        query = query.eq('ai_handled', filters.aiHandled);
      }
      if (filters?.startDate) {
        query = query.gte('started_at', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('started_at', filters.endDate);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Filter by tags and search on client side
      let results = data || [];
      
      // Filtro por busca (nome ou telefone do cliente)
      if (filters?.search && filters.search.trim()) {
        const searchTerm = filters.search.trim().toLowerCase();
        results = results.filter((conv) => {
          const clientName = `${conv.client?.first_name || ''} ${conv.client?.last_name || ''}`.toLowerCase();
          const phone = conv.client?.phone || '';
          return clientName.includes(searchTerm) || phone.includes(searchTerm);
        });
      }
      
      if (filters?.tags && filters.tags.length > 0) {
        results = results.filter((conv) => 
          filters.tags?.some((tag) => conv.tags?.includes(tag))
        );
      }
      
      // Buscar contagem de não lidas com uma única query (em vez de N+1 queries)
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - (48 * 60 * 60 * 1000)).toISOString();

      const conversationIds = results.map(c => c.id);
      const countMap: Record<string, number> = {};

      if (conversationIds.length > 0) {
        const { data: unreadMessages } = await supabase
          .from('messages')
          .select('conversation_id')
          .in('conversation_id', conversationIds)
          .eq('sender_type', 'client')
          .eq('is_read', false)
          .gte('created_at', cutoffDate);

        if (unreadMessages) {
          for (const msg of unreadMessages) {
            countMap[msg.conversation_id] = (countMap[msg.conversation_id] || 0) + 1;
          }
        }
      }

      results = results.map(conv => {
        const lastMsg = conv.messages?.[0] || null;
        return {
          ...conv,
          unread_count: countMap[conv.id] || 0,
          last_message: lastMsg ? {
            text: lastMsg.message_text,
            type: lastMsg.message_type,
            sender_type: lastMsg.sender_type,
            created_at: lastMsg.created_at,
          } : null,
        };
      });
      
      return results;
    },
    enabled: !!companyId,
    staleTime: 30000, // 30s - dados ficam "frescos" por mais tempo, reduzindo refetches
  });

  // Função para buscar mensagens de uma conversa específica
  const fetchMessagesForConversation = async (conversationId: string, cursor?: string, limit = 50) => {
    let query = supabase
      .from('messages')
      .select('*, sender:users!sender_id(id, full_name, avatar_url)')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (cursor) {
      query = query.lt('created_at', cursor);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    
    return data || [];
  };

  // Carregar mensagens iniciais de uma conversa
  const loadInitialMessages = async (conversationId: string) => {
    const state = conversationMessages[conversationId];
    if (state?.initialLoaded || state?.isLoading) return;
    
    console.log(`[Messages] Loading initial messages for conversation ${conversationId}`);
    
    setConversationMessages(prev => ({
      ...prev,
      [conversationId]: {
        messages: [],
        hasMore: true,
        isLoading: true,
        oldestCursor: null,
        initialLoaded: false,
      }
    }));
    
    try {
      const data = await fetchMessagesForConversation(conversationId);
      // Reverter para ordem cronológica (mais antigas primeiro)
      const reversedData = [...data].reverse();
      
      console.log(`[Messages] Loaded ${reversedData.length} messages for conversation ${conversationId}`);
      
      setConversationMessages(prev => ({
        ...prev,
        [conversationId]: {
          messages: reversedData,
          hasMore: data.length === 50,
          isLoading: false,
          oldestCursor: data.length > 0 ? data[data.length - 1].created_at : null,
          initialLoaded: true,
        }
      }));
    } catch (error) {
      console.error('[Messages] Error loading initial messages:', error);
      setConversationMessages(prev => ({
        ...prev,
        [conversationId]: {
          messages: [],
          hasMore: false,
          isLoading: false,
          oldestCursor: null,
          initialLoaded: true,
        }
      }));
    }
  };

  // Polling fallback
  useEffect(() => {
    if (!usePolling || !companyId) return;
    
    console.log('⚠️ Usando polling como fallback (intervalo: 10s)');
    
    pollingIntervalRef.current = setInterval(() => {
      console.log('🔄 Polling: atualizando dados...');
      console.log('🔄 Invalidando query keys: ["messages", companyId], ["conversations", companyId]');
      queryClient.invalidateQueries({ queryKey: ['messages', companyId] });
      queryClient.invalidateQueries({ queryKey: ['conversations', companyId] });
    }, 10000);
    
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [usePolling, companyId, queryClient]);

  // Realtime listener for messages with enhanced logging and retry
  useEffect(() => {
    if (!companyId) return;

    let retryCount = 0;
    const maxRetries = 5;

    const setupMessagesChannel = () => {
      console.log(`🔴 [Realtime] Configurando canal de mensagens (tentativa ${retryCount + 1}/${maxRetries})...`);
      setRealtimeStatus('connecting');

      const channel = supabase
        .channel('messages-changes', {
          config: {
            broadcast: { self: true },
            presence: { key: companyId }
          }
        })
        .on('system', {}, (payload) => {
          console.log('🔴 [System Event]', payload);
          if (payload.status === 'SUBSCRIBED') {
            console.log('✅ [Realtime] Canal de mensagens CONECTADO');
            setRealtimeStatus('connected');
            setUsePolling(false);
            retryCount = 0;
          } else if (payload.status === 'CHANNEL_ERROR') {
            console.error('❌ [Realtime] Erro no canal:', payload);
            setRealtimeStatus('disconnected');
            attemptRetry();
          } else if (payload.status === 'TIMED_OUT') {
            console.error('⏱️ [Realtime] Timeout na conexão');
            setRealtimeStatus('disconnected');
            attemptRetry();
          }
        })
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `company_id=eq.${companyId}`,
          },
          (payload) => {
            const newMessage = payload.new;
            console.log('✅ [Realtime] Nova mensagem INSERT:', {
              id: newMessage.id,
              conversation_id: newMessage.conversation_id,
              sender_type: newMessage.sender_type,
              message_text: newMessage.message_text?.substring(0, 50)
            });
            
            // Adicionar mensagem ao estado da conversa se já estiver carregada
            setConversationMessages(prev => {
              const convId = newMessage.conversation_id;
              const state = prev[convId];
              if (!state?.initialLoaded) return prev;
              
              // Remover mensagens otimistas e evitar duplicatas
              const filteredMessages = state.messages.filter(m => 
                !m._optimistic && m.id !== newMessage.id
              );
              
              // Adicionar nova mensagem e ordenar por created_at
              const updatedMessages = [...filteredMessages, newMessage].sort((a, b) => 
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              );
              
              return {
                ...prev,
                [convId]: {
                  ...state,
                  messages: updatedMessages,
                }
              };
            });
            
            // Também invalidar conversações para atualizar updated_at
            queryClient.invalidateQueries({ queryKey: ['conversations', companyId] });
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages',
            filter: `company_id=eq.${companyId}`,
          },
          (payload) => {
            const updatedMessage = payload.new;
            console.log('✅ [Realtime] Mensagem UPDATE:', {
              id: updatedMessage.id,
              read_status: updatedMessage.read_status,
            });
            
            // Atualizar mensagem no estado da conversa
            setConversationMessages(prev => {
              const convId = updatedMessage.conversation_id;
              const state = prev[convId];
              if (!state) return prev;
              
              return {
                ...prev,
                [convId]: {
                  ...state,
                  messages: state.messages.map(m => 
                    m.id === updatedMessage.id ? { ...m, ...updatedMessage } : m
                  ),
                }
              };
            });
          }
        )
        .subscribe((status, err) => {
          console.log(`🔴 [Subscribe] Status: ${status}`, err ? `Erro: ${err}` : '');
          
          if (status === 'SUBSCRIBED') {
            console.log('✅ [Realtime] Subscribe bem-sucedido');
            setRealtimeStatus('connected');
            setUsePolling(false);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('❌ [Realtime] Falha na subscription:', status, err);
            setRealtimeStatus('disconnected');
            attemptRetry();
          }
        });

      messagesChannelRef.current = channel;

      // Timeout de segurança
      setTimeout(() => {
        if (realtimeStatus === 'connecting') {
          console.warn('⏱️ [Realtime] Timeout na conexão após 30s');
          setRealtimeStatus('disconnected');
          attemptRetry();
        }
      }, 30000);
    };

    const attemptRetry = () => {
      if (retryCount >= maxRetries) {
        console.error('❌ [Realtime] Máximo de tentativas atingido. Usando polling.');
        setUsePolling(true);
        return;
      }

      retryCount++;
      const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
      console.log(`🔄 [Realtime] Tentando reconectar em ${delay}ms...`);
      
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      
      retryTimeoutRef.current = setTimeout(() => {
        if (messagesChannelRef.current) {
          supabase.removeChannel(messagesChannelRef.current);
        }
        setupMessagesChannel();
      }, delay);
    };

    setupMessagesChannel();

    return () => {
      console.log('🔴 [Cleanup] Removendo canal de mensagens');
      if (messagesChannelRef.current) {
        supabase.removeChannel(messagesChannelRef.current);
        messagesChannelRef.current = null;
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [companyId, queryClient]);

  // Realtime listener for conversations with enhanced logging
  useEffect(() => {
    if (!companyId) return;

    console.log('🟢 [Realtime] Configurando canal de conversações...');

    const channel = supabase
      .channel('conversations-changes')
      .on('system', {}, (payload) => {
        console.log('🟢 [Conversations System]', payload);
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversations',
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          console.log('✅ [Realtime] Nova conversa INSERT:', {
            id: payload.new.id,
            client_id: payload.new.client_id,
            status: payload.new.status
          });
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          console.log('✅ [Realtime] Conversa UPDATE:', {
            id: payload.new.id,
            status: payload.new.status
          });
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
      )
      .subscribe((status) => {
        console.log(`🟢 [Conversations Subscribe] Status: ${status}`);
      });

    conversationsChannelRef.current = channel;

    return () => {
      console.log('🟢 [Cleanup] Removendo canal de conversações');
      if (conversationsChannelRef.current) {
        supabase.removeChannel(conversationsChannelRef.current);
        conversationsChannelRef.current = null;
      }
    };
  }, [companyId, queryClient]);

  // Manual refresh function
  const manualRefresh = async () => {
    console.log('🔄 [Manual] Atualizando dados manualmente...');
    queryClient.invalidateQueries({ queryKey: ['conversations', companyId] });
    
    // Recarregar mensagens da conversa ativa
    Object.keys(conversationMessages).forEach(convId => {
      setConversationMessages(prev => ({
        ...prev,
        [convId]: { ...prev[convId], initialLoaded: false }
      }));
    });
    
    toast({ title: 'Conversas atualizadas' });
  };

  const getConversationMessages = (conversationId: string) => {
    const state = conversationMessages[conversationId];
    return state?.messages || [];
  };

  const getUnreadCount = (conversationId: string) => {
    const now = new Date();
    const timeLimit = new Date(now.getTime() - (48 * 60 * 60 * 1000)); // 48 horas atrás
    
    const convMessages = conversationMessages[conversationId]?.messages || [];
    
    // Encontrar última mensagem do agente ou IA
    const lastAgentMessage = convMessages
      .filter(m => m.sender_type === 'agent' || m.sender_type === 'ai')
      .sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime())[0];
    
    const lastAgentTime = lastAgentMessage?.created_at;
    
    // Contar apenas mensagens do cliente não lidas das últimas 48h após última resposta do agente
    const unreadMessages = convMessages.filter(m => {
      if (m.sender_type !== 'client' || m.is_read !== false) return false;
      
      const messageTime = new Date(m.created_at!);
      
      // Deve ser das últimas 48h
      if (messageTime < timeLimit) return false;
      
      // Se há resposta do agente, deve ser depois dela
      if (lastAgentTime && messageTime <= new Date(lastAgentTime)) {
        return false;
      }
      
      return true;
    });
    
    return unreadMessages.length;
  };

  // Carregar mensagens mais antigas (infinite scroll reverso)
  const loadOlderMessages = async (conversationId: string): Promise<number> => {
    const state = conversationMessages[conversationId];
    if (!state || !state.hasMore || state.isLoading) return 0;
    
    console.log(`[Messages] Loading older messages for ${conversationId}, cursor: ${state.oldestCursor}`);
    
    setConversationMessages(prev => ({
      ...prev,
      [conversationId]: { ...prev[conversationId], isLoading: true }
    }));
    
    try {
      const data = await fetchMessagesForConversation(conversationId, state.oldestCursor || undefined);
      // Reverter para ordem cronológica
      const reversedData = [...data].reverse();
      
      console.log(`[Messages] Loaded ${reversedData.length} older messages`);
      
      setConversationMessages(prev => ({
        ...prev,
        [conversationId]: {
          messages: [...reversedData, ...prev[conversationId].messages],
          hasMore: data.length === 50,
          isLoading: false,
          oldestCursor: data.length > 0 ? data[data.length - 1].created_at : prev[conversationId].oldestCursor,
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

  // Adicionar nova mensagem ao estado (para real-time e optimistic updates)
  const addMessageToConversation = (conversationId: string, message: any) => {
    setConversationMessages(prev => {
      const state = prev[conversationId];
      if (!state) return prev;
      
      // Evitar duplicatas
      if (state.messages.some(m => m.id === message.id)) return prev;
      
      return {
        ...prev,
        [conversationId]: {
          ...state,
          messages: [...state.messages, message],
        }
      };
    });
  };

  // Atualizar mensagem existente (para status updates)
  const updateMessageInConversation = (conversationId: string, messageId: string, updates: any) => {
    setConversationMessages(prev => {
      const state = prev[conversationId];
      if (!state) return prev;
      
      return {
        ...prev,
        [conversationId]: {
          ...state,
          messages: state.messages.map(m => 
            m.id === messageId ? { ...m, ...updates } : m
          ),
        }
      };
    });
  };

  const updateConversation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { data, error } = await supabase
        .from('conversations')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({ title: 'Conversa atualizada com sucesso' });
    },
    onError: (error: any) => {
      toast({
        title: '❌ Erro ao atualizar conversa',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  const transferConversation = useMutation({
    mutationFn: async ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      const { data, error } = await supabase
        .from('conversations')
        .update({ 
          transferred_to: userId,
          status: 'transferred',
          ai_handled: false 
        })
        .eq('id', conversationId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({ title: 'Conversa transferida com sucesso' });
    },
    onError: (error: any) => {
      toast({
        title: '❌ Erro ao transferir conversa',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
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
      toast({
        title: 'Erro ao transferir conversa',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  const closeConversation = useMutation({
    mutationFn: async (conversationId: string) => {
      const { data, error } = await supabase
        .from('conversations')
        .update({ 
          status: 'closed',
          ended_at: new Date().toISOString()
        })
        .eq('id', conversationId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({ title: 'Conversa encerrada com sucesso' });
    },
    onError: (error: any) => {
      toast({
        title: '❌ Erro ao encerrar conversa',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  const addTag = useMutation({
    mutationFn: async ({ conversationId, tag }: { conversationId: string; tag: string }) => {
      const conversation = conversations?.find(c => c.id === conversationId);
      const currentTags = conversation?.tags || [];
      
      const { data, error } = await supabase
        .from('conversations')
        .update({ 
          tags: [...currentTags, tag],
          updated_at: new Date().toISOString() 
        })
        .eq('id', conversationId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({ title: 'Etiqueta adicionada com sucesso' });
    },
    onError: (error: any) => {
      toast({
        title: '❌ Erro ao adicionar etiqueta',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  const removeTag = useMutation({
    mutationFn: async ({ conversationId, tag }: { conversationId: string; tag: string }) => {
      const conversation = conversations?.find(c => c.id === conversationId);
      const currentTags = conversation?.tags || [];
      
      const { data, error } = await supabase
        .from('conversations')
        .update({ 
          tags: currentTags.filter(t => t !== tag),
          updated_at: new Date().toISOString() 
        })
        .eq('id', conversationId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({ title: 'Etiqueta removida com sucesso' });
    },
    onError: (error: any) => {
      toast({
        title: '❌ Erro ao remover etiqueta',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  const reopenConversation = useMutation({
    mutationFn: async (conversationId: string) => {
      const { data, error } = await supabase
        .from('conversations')
        .update({ 
          status: 'active',
          ended_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({ title: 'Conversa reaberta com sucesso' });
    },
    onError: (error: any) => {
      toast({
        title: '❌ Erro ao reabrir conversa',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
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
      const payload: any = {
        message: messageText,
        conversationId,
      };
      
      if (phone) payload.phone = phone;
      if (replyToMessageId) payload.replyToMessageId = replyToMessageId;

      const { data, error } = await invokeFn('send-message-text', payload);

      if (error) throw error;
      return data;
    },
    onMutate: async ({ conversationId, messageText }) => {
      // Obter dados do usuário atual
      const { data: { user } } = await supabase.auth.getUser();
      
      const optimisticMessage = {
        id: `temp-${Date.now()}`,
        conversation_id: conversationId,
        sender_type: 'agent',
        sender_id: user?.id || null,
        message_text: messageText,
        message_type: 'text',
        is_read: false,
        created_at: new Date().toISOString(),
        metadata: {},
        _optimistic: true,
      };

      // Adicionar ao estado local (que é usado pela UI)
      setConversationMessages(prev => {
        const state = prev[conversationId];
        if (!state) return prev;
        
        return {
          ...prev,
          [conversationId]: {
            ...state,
            messages: [...state.messages, optimisticMessage],
          }
        };
      });

      return { conversationId, optimisticId: optimisticMessage.id };
    },
    onError: (error: any, variables) => {
      // Remover mensagem otimista em caso de erro
      setConversationMessages(prev => {
        const state = prev[variables.conversationId];
        if (!state) return prev;
        
        return {
          ...prev,
          [variables.conversationId]: {
            ...state,
            messages: state.messages.filter(m => !m._optimistic),
          }
        };
      });
      
      toast({
        title: '❌ Erro ao enviar mensagem',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    },
    onSettled: () => {
      // Apenas invalidar conversações para atualizar updated_at
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
      // Converter Blob para base64
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
          conversationId,
          audioBase64,
          duration,
          mimeType: audioBlob.type,
        });

      if (error) throw error;
      return data;
    },
    onMutate: async ({ conversationId }) => {
      // Adicionar mensagem otimista de áudio
      const { data: { user } } = await supabase.auth.getUser();
      
      const optimisticMessage = {
        id: `temp-audio-${Date.now()}`,
        conversation_id: conversationId,
        sender_type: 'agent',
        sender_id: user?.id || null,
        message_text: '🎤 Enviando áudio...',
        message_type: 'audio',
        is_read: false,
        created_at: new Date().toISOString(),
        metadata: {},
        _optimistic: true,
      };

      setConversationMessages(prev => {
        const state = prev[conversationId];
        if (!state) return prev;
        
        return {
          ...prev,
          [conversationId]: {
            ...state,
            messages: [...state.messages, optimisticMessage],
          }
        };
      });

      return { conversationId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error: any, variables) => {
      // Remover mensagem otimista em caso de erro
      setConversationMessages(prev => {
        const state = prev[variables.conversationId];
        if (!state) return prev;
        
        return {
          ...prev,
          [variables.conversationId]: {
            ...state,
            messages: state.messages.filter(m => !m._optimistic),
          }
        };
      });
      
      toast({
        title: '❌ Erro ao enviar áudio',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  const deleteMessage = useMutation({
    mutationFn: async ({ messageId, conversationId }: { messageId: string; conversationId: string }) => {
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId);
      
      if (error) throw error;
      return { messageId, conversationId };
    },
    onSuccess: ({ messageId, conversationId }) => {
      // Remover mensagem do estado local
      setConversationMessages(prev => {
        const state = prev[conversationId];
        if (!state) return prev;
        
        return {
          ...prev,
          [conversationId]: {
            ...state,
            messages: state.messages.filter(m => m.id !== messageId),
          }
        };
      });
      
      toast({
        title: "Mensagem apagada",
        description: "A mensagem foi removida com sucesso.",
      });
    },
    onError: (error: any) => {
      toast({
        title: '❌ Erro ao apagar mensagem',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  const transcribeMessage = useMutation({
    mutationFn: async ({ messageId, conversationId }: { messageId: string; conversationId: string }) => {
      const { data, error } = await invokeFn('transcribe-audio', { messageId });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Transcription failed');

      return {
        messageId,
        conversationId,
        transcription: data.transcription,
        cached: data.cached
      };
    },
    onSuccess: (data) => {
      // Atualizar mensagem no estado local
      setConversationMessages(prev => {
        const state = prev[data.conversationId];
        if (!state) return prev;
        
        return {
          ...prev,
          [data.conversationId]: {
            ...state,
            messages: state.messages.map(m => 
              m.id === data.messageId 
                ? { ...m, message_text: data.transcription }
                : m
            ),
          }
        };
      });

      toast({
        title: data.cached ? 'Transcrição carregada' : 'Áudio transcrito com sucesso',
        description: data.cached ? 'Transcrição já estava disponível' : 'A transcrição foi adicionada à mensagem',
      });
    },
    onError: (error: any) => {
      toast({
        title: '❌ Erro ao transcrever áudio',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  const sendMediaMessage = useMutation({
    mutationFn: async ({ 
      conversationId, 
      fileUrl,
      fileName,
      fileSize,
      mimeType,
      mediaType = 'document'
    }: { 
      conversationId: string;
      fileUrl: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      mediaType?: 'image' | 'video' | 'document' | 'audio';
    }) => {
      // Buscar telefone do cliente
      const conversation = conversations?.find(c => c.id === conversationId);
      if (!conversation?.client?.phone) {
        throw new Error('Telefone do cliente não encontrado');
      }
      
      const { data, error } = await invokeFn('send-message-media', {
          phone: conversation.client.phone,
          type: mediaType,
          file: fileUrl,
          text: mediaType === 'document' ? fileName : undefined,
          docName: mediaType === 'document' ? fileName : undefined,
          fileSize: fileSize,
          mimeType: mimeType,
          conversationId,
          fromAI: false,
        });
      
      if (error) throw error;
      return data;
    },
    onMutate: async ({ conversationId, mediaType, fileName }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const typeLabels: Record<string, string> = {
        image: '📷 Enviando imagem...',
        video: '🎬 Enviando vídeo...',
        document: `📄 Enviando ${fileName}...`,
      };
      
      const optimisticMessage = {
        id: `temp-media-${Date.now()}`,
        conversation_id: conversationId,
        sender_type: 'agent',
        sender_id: user?.id || null,
        message_text: typeLabels[mediaType || 'document'],
        message_type: mediaType || 'document',
        is_read: false,
        created_at: new Date().toISOString(),
        metadata: {},
        _optimistic: true,
      };

      setConversationMessages(prev => {
        const state = prev[conversationId];
        if (!state) return prev;
        
        return {
          ...prev,
          [conversationId]: {
            ...state,
            messages: [...state.messages, optimisticMessage],
          }
        };
      });

      return { conversationId };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      const typeLabels: Record<string, string> = {
        image: 'Imagem enviada',
        video: 'Vídeo enviado',
        document: 'Documento enviado',
      };
      toast({
        title: typeLabels[variables.mediaType || 'document'] || 'Mídia enviada',
        description: 'Arquivo enviado com sucesso.',
      });
    },
    onError: (error: any, variables) => {
      // Remover mensagem otimista em caso de erro
      setConversationMessages(prev => {
        const state = prev[variables.conversationId];
        if (!state) return prev;
        
        return {
          ...prev,
          [variables.conversationId]: {
            ...state,
            messages: state.messages.filter(m => !m._optimistic),
          }
        };
      });
      
      toast({
        title: '❌ Erro ao enviar mídia',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  // Toggle AI paused for client
  const toggleClientAIPaused = useMutation({
    mutationFn: async ({ clientId, currentValue }: { clientId: string; currentValue: boolean }) => {
      const { error } = await supabase
        .from('clients')
        .update({ ai_paused: !currentValue })
        .eq('id', clientId);
      if (error) throw error;
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
      toast({
        title: 'Erro',
        description: 'Não foi possível alterar o status da IA',
        variant: 'destructive',
      });
    }
  });

  // Backward compatibility alias
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

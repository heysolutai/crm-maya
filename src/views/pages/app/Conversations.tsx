import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useConversations } from '@/hooks/useConversations';
import { useTeam } from '@/hooks/useTeam';
import { useAuth } from '@/hooks/useAuth';
import { useAgentTypingIndicator } from '@/hooks/useAgentTypingIndicator';
import { useWhatsAppTypingIndicator } from '@/hooks/useWhatsAppTypingIndicator';
import { useMediaUpload } from '@/hooks/useMediaUpload';
import { useConversationReactions } from '@/hooks/useMessageReactions';
import { useQuotedMessages } from '@/hooks/useQuotedMessages';
import { useConversationScroll } from '@/hooks/useConversationScroll';
import { useCreateConversation } from '@/hooks/useCreateConversation';
import { useMessageInput } from '@/hooks/useMessageInput';
import { useDepartments } from '@/hooks/useDepartments';
import { useInboxes } from '@/hooks/useInboxes';
import { useDepartmentQueue } from '@/hooks/useDepartmentQueue';
import { usePresenceContext } from '@/hooks/usePresence';
import { MessageCircle, Loader2, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

// Components
import { ConversationSidebar } from '@/components/conversations/ConversationSidebar';
import { ConversationHeader } from '@/components/conversations/ConversationHeader';
import { MessageBubble } from '@/components/conversations/MessageBubble';
import { NoteBubble } from '@/components/conversations/NoteBubble';
import { MessageInput } from '@/components/conversations/MessageInputArea';
import { TypingIndicator } from '@/components/conversations/TypingIndicator';
import { TagManager } from '@/components/conversations/TagManager';
import { ImageModal } from '@/components/conversations/ImageModal';
import { ConversationNotes } from '@/components/conversations/ConversationNotes';
import { TransferDialog } from '@/components/conversations/dialogs/TransferDialog';
import { EditClientDialog } from '@/components/conversations/dialogs/EditClientDialog';
import { CloseConversationDialog } from '@/components/conversations/dialogs/CloseConversationDialog';
import { NewConversationDialog } from '@/components/conversations/dialogs/NewConversationDialog';
import { DeleteMessageDialog } from '@/components/conversations/dialogs/DeleteMessageDialog';
import { ForwardMessageDialog } from '@/components/conversations/dialogs/ForwardMessageDialog';
import type { Message, Conversation, TeamMember } from '@/components/conversations/types';

export default function Conversations() {
  const searchParams = useSearchParams();
  // Core state
  const [selectedConversation, setSelectedConversation] = useState<string | null>(
    searchParams.get('conversation')
  );
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('conversation') ? 'all' : 'active');
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  
  // Dialog states
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [notesSheetOpen, setNotesSheetOpen] = useState(false);
  const [newConversationDialogOpen, setNewConversationDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false);
  const [messageToForward, setMessageToForward] = useState<Message | null>(null);

  // Selecao em massa de mensagens
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  
  // Media state
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const isUploadingRef = useRef(false);

  const filters = {
    search,
    status: statusFilter !== 'all' && statusFilter !== 'unread' && statusFilter !== 'transferred' ? statusFilter : undefined,
    tags: tagFilters.length > 0 ? tagFilters : undefined,
    departmentId: departmentFilter !== 'all' ? departmentFilter : undefined,
    assignedTo: userFilter !== 'all' ? userFilter : undefined,
    inboxId: agentFilter !== 'all' ? agentFilter : undefined,
  };

  // Hooks
  const {
    conversations,
    isLoading,
    getConversationMessages,
    getUnreadCount,
    loadOlderMessages,
    loadInitialMessages,
    conversationMessages,
    transferConversation,
    transferToDepartment,
    pickupConversation,
    closeConversation,
    reopenConversation,
    sendMessage,
    sendAudioMessage,
    sendMediaMessage,
    isSendingMedia,
    addTag,
    removeTag,
    deleteMessage,
    deleteManyMessages,
    isDeletingMessages,
    lastTransferEvent,
    forwardMessage,
    isForwarding,
    transcribeMessage,
    isTranscribing,
    isTranscribingMessage,
    realtimeStatus,
    usePolling,
    manualRefresh,
    toggleClientAIPaused,
    isTogglingAIPaused,
  } = useConversations(filters);

  const { uploadMedia, isUploading } = useMediaUpload();
  const { teamMembers } = useTeam();
  const { departments } = useDepartments();
  const { inboxes } = useInboxes();
  const { queues: queueCounts } = useDepartmentQueue();
  const { onlineUserIds } = usePresenceContext();
  const { user, companyId } = useAuth();
  const queryClient = useQueryClient();

  const selectedConv = conversations?.find((c: Conversation) => c.id === (selectedConversation ?? '')) as Conversation | undefined;
  const messages = selectedConversation ? getConversationMessages(selectedConversation) : [];
  const messagesState = selectedConversation ? (conversationMessages[selectedConversation] as any) : (undefined as any);
  const isLoadingMessages = messagesState?.isLoading || false;
  const hasMoreMessages = messagesState?.hasMore || false;
  const initialLoaded = messagesState?.initialLoaded || false;

  // Batch reactions: ONE query for all visible messages
  const messageIds = useMemo(
    () => messages.filter((m: any) => !m._isNote).map((m: Message) => m.id),
    [messages]
  );
  const { reactionsMap, addReaction, removeReaction } = useConversationReactions(messageIds);

  // Typing indicators
  const {
    typingAgents,
    notifyTyping,
    stopTyping,
  } = useAgentTypingIndicator(
    selectedConversation,
    user?.id || null,
    user?.user_metadata?.full_name || user?.email || null
  );

  const { notifyTypingDebounced } = useWhatsAppTypingIndicator(
    selectedConversation || null
  );

  // Message input hook
  const {
    messageText,
    showEmojiPicker,
    setShowEmojiPicker,
    showAudioRecorder,
    setShowAudioRecorder,
    showVideoRecorder,
    setShowVideoRecorder,
    replyToMessage,
    handleInputChange,
    handleEmojiSelect,
    handleReply,
    handleCancelReply,
    clearInput,
  } = useMessageInput({
    notifyTyping,
    stopTyping,
    notifyTypingDebounced,
  });

  // Scroll management — scrollToMessage do hook usa querySelector (nao funciona
  // bem com virtualizacao). Definimos uma versao virtualizer-aware abaixo
  // (handleScrollToMessage).
  const {
    scrollContainerRef,
    handleScroll,
    registerUserInteraction,
  } = useConversationScroll({
    selectedConversation,
    messages,
    isLoadingMessages,
    hasMoreMessages,
    initialLoaded,
    loadOlderMessages,
    loadInitialMessages,
  });

  // Quoted messages
  const { quotedMessages } = useQuotedMessages(messages as Message[]);

  // Create conversation
  const { createConversation, isCreating } = useCreateConversation({
    companyId,
    onSuccess: (conversationId) => {
      setSelectedConversation(conversationId);
      setNewConversationDialogOpen(false);
    },
  });

  // All tags from conversations
  const allTags: string[] = Array.from(
    new Set<string>(conversations?.flatMap((c: any) => (c.tags || []) as string[]))
  ).sort();

  const toggleTagFilter = (tag: string) => {
    setTagFilters((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // Mark messages as read
  useEffect(() => {
    if (!selectedConversation) return;

    const markMessagesAsRead = async () => {
      const res = await fetch('/api/messages/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: selectedConversation }),
      });
      if (!res.ok) return;
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['total-unread-conversations'] });
    };

    markMessagesAsRead();
  }, [selectedConversation, queryClient]);

  // Poll for reaction updates (replaces realtime subscription)
  useEffect(() => {
    if (!companyId || !selectedConversation) return;

    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['conversation-reactions', selectedConversation] });
    }, 10000); // poll every 10 seconds

    return () => clearInterval(interval);
  }, [companyId, selectedConversation, queryClient]);

  // Handle file upload - usando ref para prevenir envios duplicados
  useEffect(() => {
    if (!selectedFile || !selectedConversation || isUploadingRef.current) return;
    
    const handleFileUpload = async () => {
      isUploadingRef.current = true;
      const fileToUpload = selectedFile;
      setSelectedFile(null); // Limpar imediatamente
      
      try {
        const result = await uploadMedia(fileToUpload);
        sendMediaMessage({
          conversationId: selectedConversation,
          fileUrl: result.url,
          fileName: result.fileName,
          fileSize: result.fileSize,
          mimeType: result.mimeType,
          mediaType: result.mediaType,
        });
      } catch (error) {
        console.error('Error uploading file:', error);
      } finally {
        isUploadingRef.current = false;
      }
    };
    
    handleFileUpload();
  }, [selectedFile, selectedConversation]);

  // Keyboard shortcut for manual refresh
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        manualRefresh();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [manualRefresh]);

  // Handlers
  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedConv) return;
    
    const textToSend = messageText.trim();
    const replyingTo = replyToMessage?.id;
    const phone = selectedConv.client?.phone || undefined;

    clearInput();

    sendMessage({
      conversationId: selectedConv.id,
      messageText: textToSend,
      phone: phone ?? undefined,
      replyToMessageId: replyingTo,
    });
  };

  const handleSendAudio = async (audioBlob: Blob, duration: number) => {
    if (!selectedConv) {
      console.error('[handleSendAudio] No conversation selected');
      return;
    }
    console.log('[handleSendAudio] Sending audio', { 
      conversationId: selectedConv.id, 
      blobSize: audioBlob.size, 
      blobType: audioBlob.type,
      duration 
    });
    try {
      await sendAudioMessage.mutateAsync({
        conversationId: selectedConv.id,
        audioBlob,
        duration,
      });
      setShowAudioRecorder(false);
    } catch (error) {
      console.error('[handleSendAudio] Error sending audio:', error);
      toast({
        title: 'Erro ao enviar áudio',
        description: 'Não foi possível enviar o áudio. Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  const handleSendVideo = (videoBlob: Blob, mimeType: string, _duration: number) => {
    if (!selectedConv) return;
    // Reaproveita o pipeline de upload de arquivo: converte blob em File e
    // dispara o mesmo fluxo de paperclip (upload pra B2 + send-media com video).
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const file = new File([videoBlob], `video-${Date.now()}.${ext}`, { type: mimeType });
    setSelectedFile(file);
    setShowVideoRecorder(false);
  };

  const handleDelete = (messageId: string) => {
    setMessageToDelete(messageId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (messageToDelete && selectedConversation) {
      deleteMessage({ messageId: messageToDelete, conversationId: selectedConversation });
    }
    setDeleteDialogOpen(false);
    setMessageToDelete(null);
  };

  // === SELECAO EM MASSA ===
  // Callbacks estaveis (useCallback) pros MessageBubble memoizados nao
  // re-renderizarem em cascata. So a bubble cujo isSelected muda re-renderiza.
  const handleEnterSelectionMode = useCallback((messageId: string) => {
    setSelectionMode(true);
    setSelectedMessageIds(new Set([messageId]));
  }, []);

  const handleToggleSelectMessage = useCallback((messageId: string) => {
    setSelectedMessageIds(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedMessageIds(new Set());
  }, []);

  const confirmBulkDelete = () => {
    if (selectedMessageIds.size > 0 && selectedConversation) {
      deleteManyMessages({
        messageIds: Array.from(selectedMessageIds),
        conversationId: selectedConversation,
      });
    }
    setBulkDeleteDialogOpen(false);
    exitSelectionMode();
  };

  // Trocar de conversa zera a selecao (evita apagar mensagem da conversa errada).
  useEffect(() => {
    setSelectionMode(false);
    setSelectedMessageIds(new Set());
  }, [selectedConversation]);

  // Notificacao de transferencia (toast grande com acoes). Audiencia:
  // - status 'pending' (foi pra fila do departamento) -> notifica todos os agentes
  // - alvo direto -> so o agente cujo id bate com targetUserId
  useEffect(() => {
    if (!lastTransferEvent) return;
    const ev = lastTransferEvent;
    const isForMe = ev.status === 'pending' || ev.targetUserId === user?.id;
    if (!isForMe) return;
    if (ev.conversationId === selectedConversation) return; // ja estou nela

    const t = toast({
      title: '🔔 Conversa transferida',
      duration: 15000,
      description: (
        <div className="mt-1 space-y-2">
          <p className="text-sm">
            {(ev.clientName || 'Cliente') +
              (ev.status === 'pending'
                ? ' está aguardando atendimento'
                : ' foi transferida para você')}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setStatusFilter('pending');
                setSelectedConversation(null);
                t.dismiss();
              }}
            >
              Ver em espera
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setSelectedConversation(ev.conversationId);
                t.dismiss();
              }}
            >
              Atender
            </Button>
          </div>
        </div>
      ),
    });
    // Dispara apenas quando um novo evento de transferencia chega (nonce muda).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastTransferEvent]);

  // Pre-calculado uma vez por render do array de mensagens — evita O(n) em CADA
  // <MessageBubble>. Antes, isFirstInGroup(idx) era chamado 500x por re-render.
  const firstInGroupFlags = useMemo(() => {
    const flags = new Array(messages.length);
    for (let i = 0; i < messages.length; i++) {
      if (i === 0) {
        flags[i] = true;
      } else {
        flags[i] = messages[i].sender_type !== messages[i - 1].sender_type;
      }
    }
    return flags;
  }, [messages]);

  // Callbacks estaveis pros MessageBubble nao re-renderizarem em cascata.
  // Antes, arrow inline criava nova funcao a cada render -> memo do MessageBubble
  // nao funcionava -> todas as ~500 bubbles re-renderizavam em qualquer mudanca.
  const handleReact = useCallback((msgId: string, emoji: string) => {
    addReaction({ messageId: msgId, emoji });
  }, [addReaction]);

  const handleForward = useCallback((m: Message) => {
    setMessageToForward(m);
    setForwardDialogOpen(true);
  }, []);

  const handleTranscribe = useCallback((msgId: string) => {
    if (selectedConversation) {
      transcribeMessage({ messageId: msgId, conversationId: selectedConversation });
    }
  }, [transcribeMessage, selectedConversation]);

  // === VIRTUALIZACAO DA LISTA DE MENSAGENS ===
  // Renderiza somente os itens visiveis + algumas linhas de overscan, em vez
  // de manter 500+ bubbles no DOM. Combina com a paginacao infinite-scroll:
  // - load older preserva scroll naturalmente (DOM scrollHeight cresce, scrollTop e
  //   ajustado pelo useConversationScroll que ja existe)
  // - getItemKey usa msg.id pra manter cache de medicao entre re-renders
  // - estimateSize: 90px (chute razoavel pra texto curto); medidas reais
  //   substituem quando o item entra em vista via measureElement.
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 90,
    overscan: 8,
    getItemKey: (idx) => (messages[idx] as any)?.id ?? idx,
  });

  // scrollToMessage virtualizer-aware: encontra index, scroll, depois highlight.
  // Substitui o do hook que usava querySelector (que falha quando item nao esta
  // no DOM por causa da virtualizacao).
  const handleScrollToMessage = useCallback(
    (messageId: string) => {
      const idx = messages.findIndex((m: any) => m.id === messageId);
      if (idx === -1) return;
      virtualizer.scrollToIndex(idx, { align: 'center', behavior: 'smooth' });
      // Esperar item renderizar antes de highlight
      setTimeout(() => {
        const el = document.querySelector(`[data-message-id="${messageId}"]`);
        if (el) {
          el.classList.add('ring-2', 'ring-yellow-400', 'ring-offset-2');
          setTimeout(() => {
            el.classList.remove('ring-2', 'ring-yellow-400', 'ring-offset-2');
          }, 2000);
        }
      }, 300);
    },
    [messages, virtualizer],
  );

  return (
    <div className="flex h-full bg-background">
      {/* Sidebar: hidden on mobile when a conversation is selected */}
      <div className={cn(
        "flex-col h-full min-h-0",
        selectedConversation ? "hidden md:flex" : "flex w-full md:w-auto"
      )}>
        <ConversationSidebar
          conversations={conversations as Conversation[]}
          selectedConversation={selectedConversation}
          onSelectConversation={setSelectedConversation}
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          departmentFilter={departmentFilter}
          onDepartmentFilterChange={setDepartmentFilter}
          userFilter={userFilter}
          onUserFilterChange={setUserFilter}
          agentFilter={agentFilter}
          onAgentFilterChange={setAgentFilter}
          agents={inboxes || []}
          teamMembers={(teamMembers as TeamMember[]) || []}
          departments={(departments || []).map((d: any) => ({ id: d.id, name: d.name, color: d.color || '#6b7280' }))}
          queueCounts={queueCounts}
          tagFilters={tagFilters}
          onToggleTagFilter={toggleTagFilter}
          allTags={allTags}
          isLoading={isLoading}
          realtimeStatus={realtimeStatus}
          usePolling={usePolling}
          onRefresh={manualRefresh}
          onNewConversation={() => setNewConversationDialogOpen(true)}
          onPickupConversation={(id) => pickupConversation(id)}
        />
      </div>

      {/* Chat area: hidden on mobile when no conversation is selected */}
      <div className={cn(
        "flex-1 flex flex-col min-h-0 min-w-0",
        selectedConversation ? "flex" : "hidden md:flex"
      )}>
        {selectedConv ? (
          <>
            <ConversationHeader
              conversation={selectedConv}
              isTogglingAIPaused={isTogglingAIPaused}
              onToggleAIPaused={() => toggleClientAIPaused({ 
                clientId: selectedConv.client!.id, 
                currentValue: selectedConv.client?.ai_paused || false 
              })}
              onOpenNotes={() => setNotesSheetOpen(true)}
              onTransfer={() => setTransferDialogOpen(true)}
              onClose={() => setCloseDialogOpen(true)}
              onReopen={() => reopenConversation(selectedConv.id)}
              onOpenTagManager={() => setTagManagerOpen(true)}
              onRemoveTag={(tag) => removeTag({ conversationId: selectedConv.id, tag })}
              onEditContact={() => setEditClientOpen(true)}
              onBack={() => setSelectedConversation(null)}
            />

            {/* Barra de seleção em massa */}
            {selectionMode && (
              <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/40">
                <Button variant="ghost" size="sm" onClick={exitSelectionMode}>
                  <X className="h-4 w-4 mr-1" />
                  Cancelar
                </Button>
                <span className="text-sm font-medium">
                  {selectedMessageIds.size} selecionada(s)
                </span>
                <Button
                  variant="destructive"
                  size="sm"
                  className="ml-auto"
                  disabled={selectedMessageIds.size === 0 || isDeletingMessages}
                  onClick={() => setBulkDeleteDialogOpen(true)}
                >
                  {isDeletingMessages ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-1" />
                  )}
                  Apagar
                </Button>
              </div>
            )}

            <div
              className="flex-1 p-4 overflow-y-auto min-h-0 touch-pan-y [overscroll-behavior-y:contain] [-webkit-overflow-scrolling:touch]"
              onScroll={handleScroll}
              onTouchStart={registerUserInteraction}
              onWheel={registerUserInteraction}
              onMouseDown={registerUserInteraction}
              ref={scrollContainerRef}
            >
              {isLoadingMessages && messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <p>Nenhuma mensagem ainda. Inicie a conversa!</p>
                </div>
              ) : (
                <>
                  {hasMoreMessages && (
                    <div className="text-center py-2">
                      {isLoadingMessages ? (
                        <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Role para cima para ver mensagens anteriores
                        </span>
                      )}
                    </div>
                  )}

                  {/* Track virtual: altura total = soma de todas as mensagens.
                      Items absolutos posicionam-se via transform translateY. */}
                  <div
                    style={{
                      height: `${virtualizer.getTotalSize()}px`,
                      width: '100%',
                      position: 'relative',
                    }}
                  >
                    {virtualizer.getVirtualItems().map((virtualRow) => {
                      const msg = messages[virtualRow.index] as Message | any;
                      if (!msg) return null;

                      return (
                        <div
                          key={virtualRow.key}
                          ref={virtualizer.measureElement}
                          data-index={virtualRow.index}
                          data-message-id={msg.id}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                          className="pb-3"
                        >
                          {msg._isNote ? (
                            <NoteBubble note={msg} />
                          ) : (
                            <MessageBubble
                              message={msg}
                              isClient={msg.sender_type === 'client'}
                              isAI={msg.sender_type === 'ai'}
                              isFirstInGroup={firstInGroupFlags[virtualRow.index]}
                              client={selectedConv.client}
                              quotedMessage={msg.quoted_message_id ? quotedMessages[msg.quoted_message_id] : undefined}
                              reactions={reactionsMap[msg.id]}
                              onScrollToMessage={handleScrollToMessage}
                              onSetSelectedImage={setSelectedImage}
                              onReply={handleReply}
                              onDelete={handleDelete}
                              onReact={handleReact}
                              onRemoveReaction={removeReaction}
                              onForward={handleForward}
                              onTranscribe={handleTranscribe}
                              isTranscribing={isTranscribingMessage(msg.id)}
                              selectionMode={selectionMode}
                              isSelected={selectedMessageIds.has(msg.id)}
                              onToggleSelect={handleToggleSelectMessage}
                              onEnterSelectionMode={handleEnterSelectionMode}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <TypingIndicator typingAgents={typingAgents} />

            <MessageInput
              messageText={messageText}
              onInputChange={handleInputChange}
              onSendMessage={handleSendMessage}
              showEmojiPicker={showEmojiPicker}
              setShowEmojiPicker={setShowEmojiPicker}
              onEmojiSelect={handleEmojiSelect}
              showAudioRecorder={showAudioRecorder}
              setShowAudioRecorder={setShowAudioRecorder}
              onSendAudio={handleSendAudio}
              showVideoRecorder={showVideoRecorder}
              setShowVideoRecorder={setShowVideoRecorder}
              onSendVideo={handleSendVideo}
              replyToMessage={replyToMessage}
              onCancelReply={handleCancelReply}
              isUploading={isUploading}
              isSendingMedia={isSendingMedia}
              onFileSelect={setSelectedFile}
            />
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <MessageCircle className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Selecione uma conversa para ver as mensagens</p>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {selectedConv && (
        <>
          <TagManager
            open={tagManagerOpen}
            onOpenChange={setTagManagerOpen}
            conversationId={selectedConv.id}
            currentTags={selectedConv.tags || []}
            onAddTag={addTag}
            onRemoveTag={removeTag}
          />
          <TransferDialog
            open={transferDialogOpen}
            onOpenChange={setTransferDialogOpen}
            teamMembers={teamMembers as TeamMember[]}
            departments={departments}
            onlineUserIds={onlineUserIds}
            queueCounts={queueCounts}
            onTransfer={(userId) => transferConversation({ conversationId: selectedConv.id, userId })}
            onTransferToDepartment={(departmentId) => transferToDepartment({ conversationId: selectedConv.id, departmentId })}
          />
          <EditClientDialog
            open={editClientOpen}
            onOpenChange={setEditClientOpen}
            client={selectedConv.client}
          />
          <CloseConversationDialog
            open={closeDialogOpen}
            onOpenChange={setCloseDialogOpen}
            onConfirm={() => {
              closeConversation(selectedConv.id);
              setCloseDialogOpen(false);
              setSelectedConversation(null);
            }}
          />
        </>
      )}

      <DeleteMessageDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
      />

      <DeleteMessageDialog
        open={bulkDeleteDialogOpen}
        onOpenChange={setBulkDeleteDialogOpen}
        onConfirm={confirmBulkDelete}
        count={selectedMessageIds.size}
      />

      <ForwardMessageDialog
        open={forwardDialogOpen}
        onOpenChange={(v) => {
          setForwardDialogOpen(v);
          if (!v) setMessageToForward(null);
        }}
        conversations={conversations as any}
        excludeConversationId={selectedConversation}
        isForwarding={isForwarding}
        onForward={(targetId) => {
          if (!messageToForward) return;
          forwardMessage({ message: messageToForward, targetConversationId: targetId });
          setForwardDialogOpen(false);
          setMessageToForward(null);
        }}
      />

      <ImageModal 
        src={selectedImage || ''}
        alt="Imagem em tamanho completo"
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
      />

      {selectedConversation && (
        <ConversationNotes
          conversationId={selectedConversation}
          clientId={selectedConv?.client?.id}
          clientName={selectedConv?.client?.first_name}
          open={notesSheetOpen}
          onOpenChange={setNotesSheetOpen}
        />
      )}

      <NewConversationDialog
        open={newConversationDialogOpen}
        onOpenChange={setNewConversationDialogOpen}
        onCreateConversation={createConversation}
        isCreating={isCreating}
      />
    </div>
  );
}

import { useState, useRef, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useConversations } from '@/hooks/useConversations';
import { useTeam } from '@/hooks/useTeam';
import { useAuth } from '@/hooks/useAuth';
import { useAgentTypingIndicator } from '@/hooks/useAgentTypingIndicator';
import { useWhatsAppInstances } from '@/hooks/useWhatsAppInstances';
import { useWhatsAppTypingIndicator } from '@/hooks/useWhatsAppTypingIndicator';
import { useMediaUpload } from '@/hooks/useMediaUpload';
import { useConversationReactions } from '@/hooks/useMessageReactions';
import { useQuotedMessages } from '@/hooks/useQuotedMessages';
import { useConversationScroll } from '@/hooks/useConversationScroll';
import { useCreateConversation } from '@/hooks/useCreateConversation';
import { useMessageInput } from '@/hooks/useMessageInput';
import { useDepartments } from '@/hooks/useDepartments';
import { useDepartmentQueue } from '@/hooks/useDepartmentQueue';
import { usePresenceContext } from '@/hooks/usePresence';
import { MessageCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

// Components
import { ConversationSidebar } from '@/components/conversations/ConversationSidebar';
import { ConversationHeader } from '@/components/conversations/ConversationHeader';
import { MessageBubble } from '@/components/conversations/MessageBubble';
import { MessageInput } from '@/components/conversations/MessageInputArea';
import { TypingIndicator } from '@/components/conversations/TypingIndicator';
import { TagManager } from '@/components/conversations/TagManager';
import { ImageModal } from '@/components/conversations/ImageModal';
import { ConversationNotes } from '@/components/conversations/ConversationNotes';
import { TransferDialog } from '@/components/conversations/dialogs/TransferDialog';
import { CloseConversationDialog } from '@/components/conversations/dialogs/CloseConversationDialog';
import { NewConversationDialog } from '@/components/conversations/dialogs/NewConversationDialog';
import { DeleteMessageDialog } from '@/components/conversations/dialogs/DeleteMessageDialog';
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
  
  // Dialog states
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [notesSheetOpen, setNotesSheetOpen] = useState(false);
  const [newConversationDialogOpen, setNewConversationDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  
  // Media state
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const isUploadingRef = useRef(false);

  const filters = {
    search,
    status: statusFilter !== 'all' && statusFilter !== 'unread' ? statusFilter : undefined,
    tags: tagFilters.length > 0 ? tagFilters : undefined,
    departmentId: departmentFilter !== 'all' ? departmentFilter : undefined,
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
    transcribeMessage,
    isTranscribing,
    realtimeStatus,
    usePolling,
    manualRefresh,
    toggleClientAIPaused,
    isTogglingAIPaused,
  } = useConversations(filters);

  const { uploadMedia, isUploading } = useMediaUpload();
  const { teamMembers } = useTeam();
  const { departments } = useDepartments();
  const { queues: queueCounts } = useDepartmentQueue();
  const { onlineUserIds } = usePresenceContext();
  const { user, companyId } = useAuth();
  const queryClient = useQueryClient();

  const { data: whatsappInstances } = useWhatsAppInstances(companyId || undefined);
  const activeInstance = whatsappInstances?.[0];

  const selectedConv = conversations?.find((c: Conversation) => c.id === (selectedConversation ?? '')) as Conversation | undefined;
  const messages = selectedConversation ? getConversationMessages(selectedConversation) : [];
  const messagesState = selectedConversation ? (conversationMessages[selectedConversation] as any) : (undefined as any);
  const isLoadingMessages = messagesState?.isLoading || false;
  const hasMoreMessages = messagesState?.hasMore || false;
  const initialLoaded = messagesState?.initialLoaded || false;

  // Batch reactions: ONE query for all visible messages
  const messageIds = useMemo(() => messages.map((m: Message) => m.id), [messages]);
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

  // Scroll management
  const {
    scrollContainerRef,
    handleScroll,
    scrollToMessage,
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
    const markMessagesAsRead = async () => {
      if (!selectedConversation || messages.length === 0) return;

      const unreadCount = getUnreadCount(selectedConversation);
      if (unreadCount === 0) return;

      await fetch('/api/messages/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: selectedConversation }),
      });
    };

    markMessagesAsRead();
  }, [selectedConversation, messages.length, getUnreadCount]);

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

  // Message grouping helper
  const isFirstInGroup = (idx: number) => {
    if (idx === 0) return true;
    const currentMsg = messages[idx];
    const prevMsg = messages[idx - 1];
    return currentMsg.sender_type !== prevMsg.sender_type;
  };

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
              onBack={() => setSelectedConversation(null)}
            />

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
                <div className="space-y-3">
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
                  
                  {messages.map((msg: Message, idx: number) => {
                    const isClient = msg.sender_type === 'client';
                    const isAI = msg.sender_type === 'ai';
                    
                    return (
                      <MessageBubble
                        key={msg.id}
                        message={msg}
                        isClient={isClient}
                        isAI={isAI}
                        isFirstInGroup={isFirstInGroup(idx)}
                        client={selectedConv.client}
                        quotedMessage={msg.quoted_message_id ? quotedMessages[msg.quoted_message_id] : undefined}
                        reactions={reactionsMap[msg.id]}
                        onScrollToMessage={scrollToMessage}
                        onSetSelectedImage={setSelectedImage}
                        onReply={handleReply}
                        onDelete={handleDelete}
                        onReact={(msgId, emoji) => addReaction({ messageId: msgId, emoji })}
                        onRemoveReaction={removeReaction}
                        onTranscribe={(msgId) => transcribeMessage({ messageId: msgId, conversationId: selectedConversation! })}
                        isTranscribing={isTranscribing}
                      />
                    );
                  })}
                </div>
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

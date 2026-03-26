import { useRef, useEffect, useCallback } from 'react';

interface UseConversationScrollOptions {
  selectedConversation: string | null;
  messages: any[];
  isLoadingMessages: boolean;
  hasMoreMessages: boolean;
  initialLoaded: boolean;
  loadOlderMessages: (conversationId: string) => Promise<number | void>;
  loadInitialMessages: (conversationId: string) => void;
}

export function useConversationScroll({
  selectedConversation,
  messages,
  isLoadingMessages,
  hasMoreMessages,
  initialLoaded,
  loadOlderMessages,
  loadInitialMessages,
}: UseConversationScrollOptions) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const isLoadingOlderRef = useRef(false);
  const shouldScrollToBottomRef = useRef(false);
  const autoScrollTimeoutRef = useRef<number | null>(null);
  const userInteractedRef = useRef(false);

  // Rastrear posição do usuário e quantidade de mensagens
  const wasNearBottomRef = useRef(true);
  const prevMessagesLengthRef = useRef(0);

  const clearPendingAutoScroll = useCallback(() => {
    if (autoScrollTimeoutRef.current !== null) {
      window.clearTimeout(autoScrollTimeoutRef.current);
      autoScrollTimeoutRef.current = null;
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, []);

  const registerUserInteraction = useCallback(() => {
    userInteractedRef.current = true;
    clearPendingAutoScroll();
  }, [clearPendingAutoScroll]);

  const scheduleAutoScrollToBottom = useCallback(
    (delayMs = 60) => {
      clearPendingAutoScroll();
      autoScrollTimeoutRef.current = window.setTimeout(() => {
        autoScrollTimeoutRef.current = null;

        if (userInteractedRef.current) return;

        requestAnimationFrame(() => {
          if (userInteractedRef.current) return;
          scrollToBottom();
          wasNearBottomRef.current = true;
        });
      }, delayMs);
    },
    [clearPendingAutoScroll, scrollToBottom]
  );

  // Carregar mensagens ao selecionar conversa
  useEffect(() => {
    clearPendingAutoScroll();

    if (selectedConversation) {
      userInteractedRef.current = false;

      if (!initialLoaded) {
        shouldScrollToBottomRef.current = true;
        wasNearBottomRef.current = true;
        prevMessagesLengthRef.current = 0;
        loadInitialMessages(selectedConversation);
      } else {
        // Conversa já carregada: abrir no final, sem bloquear o primeiro gesto do usuário
        scheduleAutoScrollToBottom(0);
      }
    }
  }, [selectedConversation, initialLoaded, loadInitialMessages, scheduleAutoScrollToBottom, clearPendingAutoScroll]);

  // Scroll para o final após carregar mensagens iniciais
  useEffect(() => {
    if (shouldScrollToBottomRef.current && messages.length > 0 && !isLoadingMessages) {
      shouldScrollToBottomRef.current = false;
      prevMessagesLengthRef.current = messages.length;
      scheduleAutoScrollToBottom(80);
    }
  }, [messages.length, isLoadingMessages, scheduleAutoScrollToBottom]);

  // Scroll para o final quando nova mensagem chegar (apenas se usuário estava no final)
  useEffect(() => {
    if (!scrollContainerRef.current || messages.length === 0) return;

    // Ignorar se estamos carregando mensagens antigas
    if (isLoadingOlderRef.current) return;

    // Detectar se é uma nova mensagem (adicionada no final) vs carregamento de antigas
    const isNewMessage = messages.length > prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    // Só fazer scroll se houver nova mensagem E o usuário estava perto do final
    if (isNewMessage && wasNearBottomRef.current) {
      scrollToBottom();
    }
  }, [messages.length, scrollToBottom]);

  // Restaurar posição do scroll após carregar mensagens antigas
  useEffect(() => {
    if (prevScrollHeightRef.current > 0 && scrollContainerRef.current && !isLoadingMessages) {
      const newScrollHeight = scrollContainerRef.current.scrollHeight;
      const scrollDiff = newScrollHeight - prevScrollHeightRef.current;
      scrollContainerRef.current.scrollTop += scrollDiff;
      prevScrollHeightRef.current = 0;
      isLoadingOlderRef.current = false;
      prevMessagesLengthRef.current = messages.length;
    }
  }, [messages.length, isLoadingMessages]);

  useEffect(() => {
    return () => clearPendingAutoScroll();
  }, [clearPendingAutoScroll]);

  const handleScroll = useCallback(async (event: React.UIEvent<HTMLDivElement>) => {
    registerUserInteraction();

    const target = event.currentTarget;
    const scrollTop = target.scrollTop;

    // Atualizar flag de proximidade ao final continuamente
    const isNearBottom = target.scrollHeight - scrollTop - target.clientHeight < 150;
    wasNearBottomRef.current = isNearBottom;

    // Carregar mensagens antigas quando chegar perto do topo
    if (
      scrollTop < 100 &&
      selectedConversation &&
      hasMoreMessages &&
      !isLoadingMessages &&
      !isLoadingOlderRef.current
    ) {
      isLoadingOlderRef.current = true;
      prevScrollHeightRef.current = target.scrollHeight;
      await loadOlderMessages(selectedConversation);
    }
  }, [selectedConversation, hasMoreMessages, isLoadingMessages, loadOlderMessages, registerUserInteraction]);

  const scrollToMessage = useCallback((messageId: string) => {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Highlight temporário
      messageElement.classList.add('ring-2', 'ring-yellow-400', 'ring-offset-2');
      setTimeout(() => {
        messageElement.classList.remove('ring-2', 'ring-yellow-400', 'ring-offset-2');
      }, 2000);
    }
  }, []);

  return {
    scrollContainerRef,
    handleScroll,
    scrollToBottom,
    scrollToMessage,
    registerUserInteraction,
  };
}

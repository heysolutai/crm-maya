import { apiFetch } from '@/lib/api/client';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invokeFn } from "@/lib/api-functions";
import { toast } from "@/hooks/use-toast";

export interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  users?: { full_name: string } | null;
}

/**
 * Batch hook: fetches all reactions for a list of message IDs in ONE query.
 */
export const useConversationReactions = (messageIds: string[]) => {
  const queryClient = useQueryClient();

  const { data: reactionsMap = {}, isLoading } = useQuery({
    queryKey: ['conversation-reactions', messageIds],
    queryFn: async () => {
      if (messageIds.length === 0) return {};

      const res = await apiFetch(`/api/message-reactions?messageIds=${messageIds.join(',')}`);
      if (!res.ok) throw new Error('Failed to fetch reactions');
      return await res.json();
    },
    enabled: messageIds.length > 0,
  });

  const addReaction = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      const { data, error } = await invokeFn('send-reaction', { messageId, emoji });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-reactions'] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao reagir",
        description: error.message || "Não foi possível enviar a reação.",
        variant: "destructive",
      });
    },
  });

  const removeReaction = useMutation({
    mutationFn: async (messageId: string) => {
      const { data, error } = await invokeFn('send-reaction', { messageId, emoji: '' });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-reactions'] });
    },
  });

  return {
    reactionsMap,
    isLoading,
    addReaction: addReaction.mutate,
    removeReaction: removeReaction.mutate,
  };
};

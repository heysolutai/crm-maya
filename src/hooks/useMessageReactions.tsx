import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { invokeFn } from "@/lib/supabase-functions-adapter";
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
 * Use this in the Conversations page instead of per-message queries.
 */
export const useConversationReactions = (messageIds: string[]) => {
  const queryClient = useQueryClient();

  const { data: reactionsMap = {}, isLoading } = useQuery({
    queryKey: ['conversation-reactions', messageIds],
    queryFn: async () => {
      if (messageIds.length === 0) return {};

      const { data, error } = await supabase
        .from('message_reactions')
        .select('*, users(full_name)')
        .in('message_id', messageIds);

      if (error) throw error;

      // Group reactions by message_id
      const map: Record<string, Reaction[]> = {};
      for (const reaction of data || []) {
        if (!map[reaction.message_id]) {
          map[reaction.message_id] = [];
        }
        map[reaction.message_id].push(reaction);
      }
      return map;
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

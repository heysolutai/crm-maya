import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from './useAuth';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { toast } from 'sonner';

export function useConversationNotes(conversationId?: string) {
  const { user } = useAuth();
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['conversation-notes', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      
      const { data, error } = await supabase
        .from('conversation_notes')
        .select(`
          *,
          user:users!created_by(full_name, avatar_url)
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!conversationId && !!companyId,
  });

  const createNote = useMutation({
    mutationFn: async ({ note }: { note: string }) => {
      if (!conversationId || !companyId || !user?.id) throw new Error('Missing data');
      
      const { data, error } = await supabase
        .from('conversation_notes')
        .insert({
          conversation_id: conversationId,
          company_id: companyId,
          created_by: user.id,
          note,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-notes', conversationId] });
      toast.success('Nota adicionada com sucesso');
    },
    onError: (error: any) => {
      toast.error('Erro ao adicionar nota: ' + error.message);
    },
  });

  const deleteNote = useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase
        .from('conversation_notes')
        .delete()
        .eq('id', noteId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-notes', conversationId] });
      toast.success('Nota removida');
    },
    onError: (error: any) => {
      toast.error('Erro ao remover nota: ' + error.message);
    },
  });

  return {
    notes,
    isLoading,
    createNote: createNote.mutate,
    deleteNote: deleteNote.mutate,
  };
}

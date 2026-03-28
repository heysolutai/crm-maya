import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

      const res = await fetch(`/api/conversation-notes?conversationId=${conversationId}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch notes');
      return await res.json() || [];
    },
    enabled: !!conversationId && !!companyId,
  });

  const createNote = useMutation({
    mutationFn: async ({ note }: { note: string }) => {
      if (!conversationId || !companyId || !user?.id) throw new Error('Missing data');

      const res = await fetch('/api/conversation-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          company_id: companyId,
          created_by: user.id,
          note,
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create note');
      return await res.json();
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
      const res = await fetch(`/api/conversation-notes?id=${noteId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete note');
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

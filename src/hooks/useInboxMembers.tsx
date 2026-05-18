import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from './use-toast';

export interface InboxMember {
  id: string;
  inbox_id: string;
  user_id: string;
  created_at: string;
  user: {
    id: string;
    full_name: string | null;
    email: string;
    avatar_url: string | null;
    is_active: boolean;
  } | null;
}

export function useInboxMembers(inboxId: string | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<InboxMember[]>({
    queryKey: ['inbox-members', inboxId],
    queryFn: async () => {
      if (!inboxId) return [];
      const res = await fetch(`/api/agents/${inboxId}/members`);
      if (!res.ok) throw new Error('Falha ao buscar membros');
      return res.json();
    },
    enabled: !!inboxId,
  });

  /** Substitui toda a lista (bulk). userIds = [] esvazia. */
  const replaceMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      if (!inboxId) throw new Error('inboxId obrigatorio');
      const res = await fetch(`/api/agents/${inboxId}/members`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Falha ao salvar');
      return json as { success: true; added: number; removed: number; total: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['inbox-members', inboxId] });
      const parts: string[] = [];
      if (data.added > 0) parts.push(`${data.added} adicionado(s)`);
      if (data.removed > 0) parts.push(`${data.removed} removido(s)`);
      toast({ title: 'Atendentes atualizados', description: parts.join(' · ') || 'Nada mudou' });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro ao salvar atendentes', description: e.message, variant: 'destructive' });
    },
  });

  return {
    members: data || [],
    memberUserIds: (data || []).map((m) => m.user_id),
    isLoading,
    replaceMembers: replaceMutation.mutate,
    isSaving: replaceMutation.isPending,
  };
}

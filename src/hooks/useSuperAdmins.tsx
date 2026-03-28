import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface SuperAdmin {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  created_at: string;
}

export function useSuperAdmins() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: superAdmins, isLoading } = useQuery({
    queryKey: ['super-admins'],
    queryFn: async (): Promise<SuperAdmin[]> => {
      const res = await fetch('/api/admin/super-admins');
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch super admins');
      return await res.json();
    },
  });

  const addSuperAdmin = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch('/api/admin/super-admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add super admin');
      }

      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admins'] });
      toast({
        title: 'Super Admin adicionado',
        description: 'O usuário agora tem acesso ao painel administrativo.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao adicionar Super Admin',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const removeSuperAdmin = useMutation({
    mutationFn: async (userId: string) => {
      // Não permitir remover a si próprio
      if (userId === user?.id) {
        throw new Error('Você não pode remover a si próprio.');
      }

      const res = await fetch(`/api/admin/super-admins?userId=${userId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove super admin');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admins'] });
      toast({
        title: 'Super Admin removido',
        description: 'O usuário não tem mais acesso ao painel administrativo.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao remover Super Admin',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    superAdmins: superAdmins || [],
    isLoading,
    addSuperAdmin,
    removeSuperAdmin,
    currentUserId: user?.id,
  };
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeFn } from '@/lib/api-functions';
import { toast } from '@/hooks/use-toast';

export interface SystemUser {
  id: string;
  email: string;
  full_name: string | null;
  company_id: string | null;
  company_name: string | null;
  is_active: boolean;
  roles: string[];
  created_at: string;
}

export function useAllUsers() {
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['all-users'],
    queryFn: async () => {
      const res = await fetch('/api/all-users');
      if (!res.ok) throw new Error('Failed to fetch all users');
      return await res.json() as SystemUser[];
    },
  });

  const setPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const { data, error } = await invokeFn('set-user-password', { userId, password });
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: (data) => {
      toast({ title: 'Senha definida', description: `Senha definida com sucesso para ${data.email}` });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao definir senha', description: error.message, variant: 'destructive' });
    },
  });

  return {
    users,
    isLoading,
    setPassword: setPasswordMutation.mutate,
    isSettingPassword: setPasswordMutation.isPending,
  };
}

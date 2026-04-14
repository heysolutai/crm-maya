import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { useToast } from './use-toast';
import { invokeFn } from '@/lib/api-functions';

export function useTeam() {
  const { user } = useAuth();
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: teamMembers, isLoading } = useQuery({
    queryKey: ['team', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const res = await fetch(`/api/team?companyId=${companyId}`);
      if (!res.ok) throw new Error('Failed to fetch team');
      return await res.json();
    },
    enabled: !!companyId,
  });

  const inviteMember = useMutation({
    mutationFn: async (data: {
      email: string;
      full_name: string;
      phone?: string;
      role: 'company_admin' | 'manager' | 'agent' | 'viewer';
    }) => {
      const { data: result, error } = await invokeFn('add-user-to-company', {
        company_id: companyId,
        email: data.email,
        full_name: data.full_name,
        phone: data.phone,
        role: data.role,
      });

      if (error) throw new Error(error);
      if (!result?.success) throw new Error(result?.error || 'Failed to invite member');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] });
      toast({ title: 'Membro convidado com sucesso' });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao convidar membro',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateMemberRole = useMutation({
    mutationFn: async ({
      userId,
      role
    }: {
      userId: string;
      role: 'company_admin' | 'manager' | 'agent' | 'viewer';
    }) => {
      if (userId === user?.id) {
        throw new Error('Você não pode alterar sua própria role');
      }

      const res = await fetch(`/api/team?companyId=${companyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateRole', userId, companyId, role }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update role');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] });
      toast({ title: 'Role atualizada com sucesso' });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao atualizar role',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const toggleMemberStatus = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      if (userId === user?.id) {
        throw new Error('Você não pode desativar seu próprio usuário');
      }

      const res = await fetch(`/api/team?companyId=${companyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggleStatus', userId, companyId, isActive }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to toggle status');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] });
      toast({ title: 'Status atualizado com sucesso' });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao atualizar status',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      if (userId === user?.id) {
        throw new Error('Você não pode remover seu próprio usuário');
      }

      const res = await fetch(`/api/team?companyId=${companyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', userId, companyId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to remove member');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] });
      toast({ title: 'Membro removido com sucesso' });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao remover membro',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const setPassword = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const { data: result, error } = await invokeFn('set-user-password', {
        userId,
        password,
      });
      if (error) throw new Error(error);
      if (!result?.success) throw new Error(result?.error || 'Failed to set password');
      return result;
    },
    onSuccess: () => {
      toast({ title: 'Senha redefinida com sucesso' });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao redefinir senha',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    teamMembers,
    isLoading,
    inviteMember: inviteMember.mutate,
    updateMemberRole: updateMemberRole.mutate,
    toggleMemberStatus: toggleMemberStatus.mutate,
    removeMember: removeMember.mutate,
    setPassword: setPassword.mutateAsync,
    isSettingPassword: setPassword.isPending,
  };
}

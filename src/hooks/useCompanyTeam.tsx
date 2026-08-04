import { apiFetch } from '@/lib/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeFn } from '@/lib/api-functions';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/getErrorMessage';

interface TeamMember {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  last_seen_at: string | null;
  user_roles: { role: string }[];
}

interface AddUserData {
  email: string;
  full_name: string;
  phone?: string;
  role: 'company_admin' | 'manager' | 'agent' | 'viewer';
}

export function useCompanyTeam(companyId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: teamMembers = [], isLoading } = useQuery({
    queryKey: ['company-team', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const res = await apiFetch(`/api/company-team?companyId=${companyId}`);
      if (!res.ok) throw new Error('Failed to fetch team');
      return await res.json() as TeamMember[];
    },
    enabled: !!companyId,
  });

  const addUserMutation = useMutation({
    mutationFn: async (userData: AddUserData) => {
      if (!companyId) throw new Error('Company ID is required');

      const { data, error } = await invokeFn('add-user-to-company', {
        company_id: companyId,
        email: userData.email,
        full_name: userData.full_name,
        phone: userData.phone,
        role: userData.role,
      });

      if (error) throw new Error(error);
      if (!data?.success) throw new Error(data?.error || 'Failed to add user');
      return data.user;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-team', companyId] });
      toast.success('Usuário adicionado com sucesso! Um email foi enviado para definir a senha.');
    },
    onError: (error: Error) => {
      console.error('Error adding user:', error);
      toast.error(`Erro ao adicionar usuário: ${getErrorMessage(error)}`);
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      if (!companyId) throw new Error('Company ID is required');

      const res = await apiFetch('/api/company-team', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateRole', userId, companyId, newRole }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update role');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-team', companyId] });
      toast.success('Role atualizada com sucesso!');
    },
    onError: (error: Error) => {
      console.error('Error updating role:', error);
      toast.error('Erro ao atualizar role');
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const res = await apiFetch('/api/company-team', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggleStatus', userId, isActive }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to toggle status');
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['company-team', companyId] });
      toast.success(variables.isActive ? 'Usuário desativado' : 'Usuário ativado');
    },
    onError: (error: Error) => {
      console.error('Error toggling status:', error);
      toast.error('Erro ao alterar status');
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!companyId) throw new Error('Company ID is required');

      const res = await apiFetch('/api/company-team', {
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
      queryClient.invalidateQueries({ queryKey: ['company-team', companyId] });
      toast.success('Usuário removido da equipe');
    },
    onError: (error: Error) => {
      console.error('Error removing member:', error);
      toast.error('Erro ao remover usuário');
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await invokeFn('reset-user-password', { userId });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to reset password');
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Email de redefinição enviado para ${data.email}`);
    },
    onError: (error: Error) => {
      console.error('Error resetting password:', error);
      toast.error(`Erro ao enviar email: ${error.message}`);
    },
  });

  const setPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const { data, error } = await invokeFn('set-user-password', { userId, password });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to set password');
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Senha definida com sucesso para ${data.userName || data.email}`);
    },
    onError: (error: Error) => {
      console.error('Error setting password:', error);
      toast.error(`Erro ao definir senha: ${error.message}`);
    },
  });

  return {
    teamMembers,
    isLoading,
    addUser: addUserMutation.mutate,
    isAddingUser: addUserMutation.isPending,
    updateRole: updateRoleMutation.mutate,
    isUpdatingRole: updateRoleMutation.isPending,
    toggleStatus: toggleStatusMutation.mutate,
    isTogglingStatus: toggleStatusMutation.isPending,
    removeMember: removeMemberMutation.mutate,
    isRemovingMember: removeMemberMutation.isPending,
    resetPassword: resetPasswordMutation.mutate,
    isResettingPassword: resetPasswordMutation.isPending,
    setPassword: setPasswordMutation.mutate,
    isSettingPassword: setPasswordMutation.isPending,
  };
}

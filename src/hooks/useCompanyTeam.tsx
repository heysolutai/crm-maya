import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { invokeFn } from '@/lib/supabase-functions-adapter';
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

  // Fetch team members for the company
  const { data: teamMembers = [], isLoading } = useQuery({
    queryKey: ['company-team', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      // Buscar IDs de usuários que são super_admin
      const { data: superAdmins } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'super_admin')
        .is('company_id', null);

      const superAdminIds = superAdmins?.map(sa => sa.user_id) || [];

      // Buscar membros da equipe, excluindo super_admins
      let query = supabase
        .from('users')
        .select(`
          id,
          email,
          full_name,
          phone,
          avatar_url,
          is_active,
          created_at,
          last_seen_at,
          user_roles!inner(role, company_id)
        `)
        .eq('company_id', companyId)
        .eq('user_roles.company_id', companyId)
        .order('created_at', { ascending: false });

      // Se houver super_admins, excluí-los
      if (superAdminIds.length > 0) {
        query = query.not('id', 'in', `(${superAdminIds.join(',')})`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as unknown as TeamMember[];
    },
    enabled: !!companyId,
  });

  // Add user to company
  const addUserMutation = useMutation({
    mutationFn: async (userData: AddUserData) => {
      if (!companyId) throw new Error('Company ID is required');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data, error } = await invokeFn('add-user-to-company', {
          company_id: companyId,
          email: userData.email,
          full_name: userData.full_name,
          phone: userData.phone,
          role: userData.role,
        });

      if (error) {
        throw new Error(error);
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to add user');
      }

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

  // Update member role
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: 'company_admin' | 'manager' | 'agent' | 'viewer' | 'super_admin' }) => {
      if (!companyId) throw new Error('Company ID is required');

      const { error } = await supabase
        .from('user_roles')
        .update({ role: newRole })
        .eq('user_id', userId)
        .eq('company_id', companyId);

      if (error) throw error;
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

  // Toggle member status
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('users')
        .update({ is_active: !isActive })
        .eq('id', userId);

      if (error) throw error;
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

  // Remove member
  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!companyId) throw new Error('Company ID is required');

      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('company_id', companyId);

      if (error) throw error;
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

  // Reset user password
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

  // Set user password directly
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

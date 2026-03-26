import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from './useAuth';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { useToast } from './use-toast';

export function useTeam() {
  const { user } = useAuth();
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: teamMembers, isLoading } = useQuery({
    queryKey: ['team', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      // Buscar membros da equipe que têm uma role nesta empresa
      // Inclui donos mesmo que também sejam super_admin
      const { data, error } = await supabase
        .from('users')
        .select(`
          *,
          user_roles!inner(role, company_id)
        `)
        .eq('company_id', companyId)
        .eq('user_roles.company_id', companyId)
        .in('user_roles.role', ['company_admin', 'manager', 'agent', 'viewer'])
        .order('full_name');

      if (error) {
        console.error('[Team] Query error:', error);
        throw error;
      }
      return data || [];
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
      // Create user in auth
      const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(
        data.email,
        {
          data: {
            full_name: data.full_name,
          },
        }
      );

      if (authError) throw authError;

      // Create user profile
      const { error: userError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email: data.email,
          full_name: data.full_name,
          phone: data.phone,
          company_id: companyId,
        });

      if (userError) throw userError;

      // Create user role
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: authData.user.id,
          role: data.role,
          company_id: companyId,
        });

      if (roleError) throw roleError;

      return authData;
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

      const { error } = await supabase
        .from('user_roles')
        .update({ role })
        .eq('user_id', userId)
        .eq('company_id', companyId);

      if (error) throw error;
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

      const { error } = await supabase
        .from('users')
        .update({ is_active: isActive })
        .eq('id', userId);

      if (error) throw error;
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

      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('company_id', companyId);

      if (error) throw error;
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

  return {
    teamMembers,
    isLoading,
    inviteMember: inviteMember.mutate,
    updateMemberRole: updateMemberRole.mutate,
    toggleMemberStatus: toggleMemberStatus.mutate,
    removeMember: removeMember.mutate,
  };
}

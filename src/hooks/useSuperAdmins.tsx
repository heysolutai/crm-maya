import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
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
      const { data, error } = await supabase
        .from('user_roles')
        .select(`
          id,
          user_id,
          created_at,
          users!user_roles_public_user_id_fkey (
            email,
            full_name
          )
        `)
        .eq('role', 'super_admin')
        .is('company_id', null);

      if (error) throw error;

      return (data || []).map((item: any) => ({
        id: item.id,
        user_id: item.user_id,
        email: item.users?.email || '',
        full_name: item.users?.full_name,
        created_at: item.created_at,
      }));
    },
  });

  const addSuperAdmin = useMutation({
    mutationFn: async (email: string) => {
      // 1. Buscar usuário pelo email
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, email')
        .eq('email', email.toLowerCase().trim())
        .single();

      if (userError || !userData) {
        throw new Error('Usuário não encontrado. O usuário precisa criar uma conta primeiro.');
      }

      // 2. Verificar se já é super_admin
      const { data: existingRole, error: roleCheckError } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userData.id)
        .eq('role', 'super_admin')
        .is('company_id', null)
        .maybeSingle();

      if (roleCheckError) throw roleCheckError;

      if (existingRole) {
        throw new Error('Este usuário já é um Super Admin.');
      }

      // 3. Adicionar role de super_admin
      const { error: insertError } = await supabase
        .from('user_roles')
        .insert({
          user_id: userData.id,
          role: 'super_admin',
          company_id: null,
        });

      if (insertError) throw insertError;

      return userData;
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

      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', 'super_admin')
        .is('company_id', null);

      if (error) throw error;
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

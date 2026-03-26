import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { invokeFn } from '@/lib/supabase-functions-adapter';
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
      // Fetch all users
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, email, full_name, company_id, is_active, created_at')
        .order('created_at', { ascending: false });

      if (usersError) throw usersError;

      // Fetch all roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Fetch all companies
      const { data: companiesData, error: companiesError } = await supabase
        .from('companies')
        .select('id, name');

      if (companiesError) throw companiesError;

      // Create lookup maps
      const rolesMap = new Map<string, string[]>();
      rolesData?.forEach((r) => {
        const existing = rolesMap.get(r.user_id) || [];
        existing.push(r.role);
        rolesMap.set(r.user_id, existing);
      });

      const companiesMap = new Map<string, string>();
      companiesData?.forEach((c) => {
        companiesMap.set(c.id, c.name);
      });

      // Combine data
      const combinedUsers: SystemUser[] = usersData.map((user) => ({
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        company_id: user.company_id,
        company_name: user.company_id ? companiesMap.get(user.company_id) || null : null,
        is_active: user.is_active ?? true,
        roles: rolesMap.get(user.id) || [],
        created_at: user.created_at || '',
      }));

      return combinedUsers;
    },
  });

  const setPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const { data, error } = await invokeFn('set-user-password', { userId, password });

      if (error) {
        throw new Error(error);
      }

      return data;
    },
    onSuccess: (data) => {
      toast({
        title: 'Senha definida',
        description: `Senha definida com sucesso para ${data.email}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao definir senha',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    users,
    isLoading,
    setPassword: setPasswordMutation.mutate,
    isSettingPassword: setPasswordMutation.isPending,
  };
}

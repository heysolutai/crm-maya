import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { toast } from '@/hooks/use-toast';

export interface DepartmentMember {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  users: {
    id: string;
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  };
}

export interface Department {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  department_members?: DepartmentMember[];
}

export function useDepartments() {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  const { data: departments = [], isLoading: loading } = useQuery({
    queryKey: ['departments', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const { data, error } = await supabase
        .from('departments')
        .select(`
          *,
          department_members(id, user_id, role, created_at)
        `)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as Department[];
    },
    enabled: !!companyId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['departments', companyId] });

  const createDepartment = async (data: { name: string; description?: string; color?: string }) => {
    if (!companyId) return null;
    if (!data.name?.trim()) {
      toast({ title: 'Erro', description: 'Nome é obrigatório', variant: 'destructive' });
      return null;
    }

    try {
      const { data: dept, error } = await supabase
        .from('departments')
        .insert({
          company_id: companyId,
          name: data.name.trim(),
          description: data.description?.trim() || null,
          color: data.color || '#6366f1',
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: 'Departamento criado', description: 'Departamento adicionado com sucesso!' });
      invalidate();
      return dept;
    } catch (error: any) {
      toast({ title: 'Erro ao criar departamento', description: error.message, variant: 'destructive' });
      return null;
    }
  };

  const updateDepartment = async (id: string, data: Partial<Department>) => {
    try {
      const { error } = await supabase
        .from('departments')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      toast({ title: 'Departamento atualizado', description: 'Alterações salvas com sucesso!' });
      invalidate();
      return true;
    } catch (error: any) {
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
      return false;
    }
  };

  const deleteDepartment = async (id: string) => {
    try {
      const { error } = await supabase
        .from('departments')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      toast({ title: 'Departamento removido', description: 'Departamento desativado com sucesso!' });
      invalidate();
      return true;
    } catch (error: any) {
      toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' });
      return false;
    }
  };

  const addMember = async (departmentId: string, userId: string, role: string = 'member') => {
    try {
      const { error } = await supabase
        .from('department_members')
        .insert({ department_id: departmentId, user_id: userId, role });

      if (error) {
        if (error.code === '23505') {
          toast({ title: 'Aviso', description: 'Usuário já é membro deste departamento', variant: 'destructive' });
          return false;
        }
        throw error;
      }

      toast({ title: 'Membro adicionado', description: 'Membro adicionado ao departamento!' });
      invalidate();
      return true;
    } catch (error: any) {
      toast({ title: 'Erro ao adicionar membro', description: error.message, variant: 'destructive' });
      return false;
    }
  };

  const removeMember = async (departmentId: string, userId: string) => {
    try {
      const { error } = await supabase
        .from('department_members')
        .delete()
        .eq('department_id', departmentId)
        .eq('user_id', userId);

      if (error) throw error;

      toast({ title: 'Membro removido', description: 'Membro removido do departamento!' });
      invalidate();
      return true;
    } catch (error: any) {
      toast({ title: 'Erro ao remover membro', description: error.message, variant: 'destructive' });
      return false;
    }
  };

  const updateMemberRole = async (departmentId: string, userId: string, role: string) => {
    try {
      const { error } = await supabase
        .from('department_members')
        .update({ role })
        .eq('department_id', departmentId)
        .eq('user_id', userId);

      if (error) throw error;

      toast({ title: 'Papel atualizado', description: 'Papel do membro atualizado!' });
      invalidate();
      return true;
    } catch (error: any) {
      toast({ title: 'Erro ao atualizar papel', description: error.message, variant: 'destructive' });
      return false;
    }
  };

  return {
    departments,
    loading,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    addMember,
    removeMember,
    updateMemberRole,
    refetch: invalidate,
  };
}

import { apiFetch } from '@/lib/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

function mapDepartment(raw: any): Department {
  return {
    id: raw.id,
    company_id: raw.companyId ?? raw.company_id,
    name: raw.name,
    description: raw.description,
    color: raw.color,
    is_active: raw.isActive ?? raw.is_active,
    created_at: raw.createdAt ?? raw.created_at,
    updated_at: raw.updatedAt ?? raw.updated_at,
    department_members: (raw.members ?? raw.department_members ?? []).map((m: any) => ({
      id: m.id,
      user_id: m.userId ?? m.user_id,
      role: m.role,
      created_at: m.createdAt ?? m.created_at,
      users: m.users || {},
    })),
  };
}

export function useDepartments() {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  const { data: departments = [], isLoading: loading } = useQuery({
    queryKey: ['departments', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const res = await apiFetch(`/api/departments?companyId=${companyId}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch departments');
      const data = await res.json();
      return (data || []).map(mapDepartment) as Department[];
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
      const res = await apiFetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          name: data.name.trim(),
          description: data.description?.trim() || null,
          color: data.color || '#6366f1',
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create department');
      const dept = await res.json();

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
      const res = await apiFetch('/api/departments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...data }),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update department');

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
      const res = await apiFetch(`/api/departments?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete department');

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
      const res = await apiFetch('/api/departments/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departmentId, userId, role }),
      });

      if (res.status === 409) {
        toast({ title: 'Aviso', description: 'Usuário já é membro deste departamento', variant: 'destructive' });
        return false;
      }
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to add member');

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
      const res = await apiFetch(`/api/departments/members?departmentId=${departmentId}&userId=${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to remove member');

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
      const res = await apiFetch('/api/departments/members', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departmentId, userId, role }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update member role');

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

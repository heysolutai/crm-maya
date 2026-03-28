import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export type ConversationAccess = 'all' | 'assigned_only' | 'none';
export type ResourceAccess = 'full' | 'read_only' | 'none';
export type RoleType = 'company_admin' | 'manager' | 'agent' | 'viewer';

export interface RolePermission {
  id: string;
  company_id: string;
  role: RoleType;
  conversation_access: ConversationAccess;
  crm_access: ResourceAccess;
  appointments_access: ResourceAccess;
  sales_access: ResourceAccess;
  can_edit_settings: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpdateRolePermissionParams {
  role: RoleType;
  conversation_access?: ConversationAccess;
  crm_access?: ResourceAccess;
  appointments_access?: ResourceAccess;
  sales_access?: ResourceAccess;
  can_edit_settings?: boolean;
}

export const ROLE_LABELS: Record<RoleType, string> = {
  company_admin: 'Administrador',
  manager: 'Gerente',
  agent: 'Agente',
  viewer: 'Visualizador',
};

export const CONVERSATION_ACCESS_LABELS: Record<ConversationAccess, string> = {
  all: 'Todas as conversas',
  assigned_only: 'Apenas atribuídas',
  none: 'Nenhuma',
};

export const RESOURCE_ACCESS_LABELS: Record<ResourceAccess, string> = {
  full: 'Acesso completo',
  read_only: 'Somente leitura',
  none: 'Sem acesso',
};

export function useRolePermissions(companyId?: string) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: rolePermissions, isLoading } = useQuery({
    queryKey: ['role-permissions', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const res = await fetch(`/api/role-permissions?companyId=${companyId}`);
      if (!res.ok) throw new Error('Failed to fetch role permissions');
      const data = await res.json();
      return (data || []).map((rp: any) => ({
        ...rp,
        company_id: rp.companyId || rp.company_id,
        conversation_access: rp.conversationAccess || rp.conversation_access,
        crm_access: rp.crmAccess || rp.crm_access,
        appointments_access: rp.appointmentsAccess || rp.appointments_access,
        sales_access: rp.salesAccess || rp.sales_access,
        can_edit_settings: rp.canEditSettings ?? rp.can_edit_settings,
        created_at: rp.createdAt || rp.created_at,
        updated_at: rp.updatedAt || rp.updated_at,
      })) as RolePermission[];
    },
    enabled: !!companyId,
  });

  const updateRolePermission = useMutation({
    mutationFn: async (params: UpdateRolePermissionParams) => {
      if (!companyId) throw new Error('Company ID is required');

      const res = await fetch('/api/role-permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, ...params }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update permissions');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-permissions', companyId] });
      queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
      toast({ title: 'Permissões atualizadas', description: 'As permissões da role foram atualizadas com sucesso.' });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar permissões',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const getPermissionByRole = (role: RoleType): RolePermission | undefined => {
    return rolePermissions?.find(rp => rp.role === role);
  };

  const configurableRoles: RoleType[] = ['manager', 'agent', 'viewer'];

  return {
    rolePermissions,
    isLoading,
    updateRolePermission: updateRolePermission.mutate,
    isUpdating: updateRolePermission.isPending,
    getPermissionByRole,
    configurableRoles,
  };
}

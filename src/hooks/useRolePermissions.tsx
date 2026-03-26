import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
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

// Labels para exibição
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

  // Buscar permissões de todas as roles da empresa
  const { data: rolePermissions, isLoading } = useQuery({
    queryKey: ['role-permissions', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const { data, error } = await supabase
        .from('role_permissions')
        .select('*')
        .eq('company_id', companyId)
        .order('role');

      if (error) throw error;
      return data as RolePermission[];
    },
    enabled: !!companyId,
  });

  // Atualizar permissões de uma role
  const updateRolePermission = useMutation({
    mutationFn: async (params: UpdateRolePermissionParams) => {
      if (!companyId) throw new Error('Company ID is required');

      const { role, ...updates } = params;

      const { error } = await supabase
        .from('role_permissions')
        .update(updates)
        .eq('company_id', companyId)
        .eq('role', role);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-permissions', companyId] });
      queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
      toast({
        title: 'Permissões atualizadas',
        description: 'As permissões da role foram atualizadas com sucesso.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar permissões',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  // Helper para buscar permissão de uma role específica
  const getPermissionByRole = (role: RoleType): RolePermission | undefined => {
    return rolePermissions?.find(rp => rp.role === role);
  };

  // Roles configuráveis (não incluímos super_admin pois tem acesso total sempre)
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

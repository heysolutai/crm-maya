import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from './useAuth';
import type { ConversationAccess, ResourceAccess } from './useRolePermissions';

export interface UserPermissions {
  // Permissões baseadas na role
  conversation_access: ConversationAccess;
  crm_access: ResourceAccess;
  appointments_access: ResourceAccess;
  sales_access: ResourceAccess;
  can_edit_settings: boolean;
  // Configurações individuais do usuário (mantidas separadas)
  message_signature: string;
}

const DEFAULT_PERMISSIONS: UserPermissions = {
  conversation_access: 'all',
  crm_access: 'full',
  appointments_access: 'full',
  sales_access: 'full',
  can_edit_settings: true,
  message_signature: '',
};

export function useUserPermissions(userId?: string) {
  const { user, role, companyId } = useAuth();
  const targetUserId = userId || user?.id;

  // Buscar permissões baseadas na role do usuário
  const { data: permissions, isLoading } = useQuery({
    queryKey: ['user-permissions', targetUserId, companyId],
    queryFn: async () => {
      if (!targetUserId || !companyId) return DEFAULT_PERMISSIONS;

      // Buscar role do usuário e suas configurações individuais
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('settings, full_name')
        .eq('id', targetUserId)
        .single();

      if (userError) throw userError;

      // Buscar a role do usuário
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', targetUserId)
        .eq('company_id', companyId)
        .single();

      // Se for super_admin, não tem company_id na role
      let userRole = roleData?.role;
      if (!userRole && !roleError) {
        const { data: superAdminRole } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', targetUserId)
          .eq('role', 'super_admin')
          .single();
        
        if (superAdminRole) {
          userRole = 'super_admin';
        }
      }

      // Super admin e company_admin têm acesso total
      if (userRole === 'super_admin' || userRole === 'company_admin') {
        const settings = userData?.settings as any;
        return {
          conversation_access: 'all' as ConversationAccess,
          crm_access: 'full' as ResourceAccess,
          appointments_access: 'full' as ResourceAccess,
          sales_access: 'full' as ResourceAccess,
          can_edit_settings: true,
          message_signature: settings?.permissions?.message_signature || userData?.full_name || '',
        };
      }

      // Buscar permissões da role
      const { data: rolePermissions, error: permError } = await supabase
        .from('role_permissions')
        .select('*')
        .eq('company_id', companyId)
        .eq('role', userRole || 'viewer')
        .single();

      const settings = userData?.settings as any;
      
      if (permError || !rolePermissions) {
        // Fallback para permissões padrão se não encontrar
        return {
          ...DEFAULT_PERMISSIONS,
          message_signature: settings?.permissions?.message_signature || userData?.full_name || '',
        };
      }

      return {
        conversation_access: rolePermissions.conversation_access as ConversationAccess,
        crm_access: rolePermissions.crm_access as ResourceAccess,
        appointments_access: rolePermissions.appointments_access as ResourceAccess,
        sales_access: rolePermissions.sales_access as ResourceAccess,
        can_edit_settings: rolePermissions.can_edit_settings,
        message_signature: settings?.permissions?.message_signature || userData?.full_name || '',
      };
    },
    enabled: !!targetUserId,
  });

  // Admins sempre têm todas as permissões
  const effectivePermissions: UserPermissions = 
    role && ['super_admin', 'company_admin'].includes(role)
      ? { 
          conversation_access: 'all',
          crm_access: 'full',
          appointments_access: 'full',
          sales_access: 'full',
          can_edit_settings: true,
          message_signature: permissions?.message_signature || '' 
        }
      : permissions || DEFAULT_PERMISSIONS;

  // Helpers para verificar permissões específicas
  const canViewAllConversations = effectivePermissions.conversation_access === 'all';
  const canViewAssignedConversations = effectivePermissions.conversation_access !== 'none';
  const canAccessCRM = effectivePermissions.crm_access !== 'none';
  const canEditCRM = effectivePermissions.crm_access === 'full';
  const canAccessAppointments = effectivePermissions.appointments_access !== 'none';
  const canEditAppointments = effectivePermissions.appointments_access === 'full';
  const canAccessSales = effectivePermissions.sales_access !== 'none';
  const canEditSales = effectivePermissions.sales_access === 'full';

  return {
    permissions: effectivePermissions,
    isLoading,
    // Helpers
    canViewAllConversations,
    canViewAssignedConversations,
    canAccessCRM,
    canEditCRM,
    canAccessAppointments,
    canEditAppointments,
    canAccessSales,
    canEditSales,
  };
}

import { apiFetch } from '@/lib/api/client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import type { ConversationAccess, ResourceAccess } from './useRolePermissions';

export interface UserPermissions {
  conversation_access: ConversationAccess;
  crm_access: ResourceAccess;
  appointments_access: ResourceAccess;
  sales_access: ResourceAccess;
  can_edit_settings: boolean;
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

  const { data: permissions, isLoading } = useQuery({
    queryKey: ['user-permissions', targetUserId, companyId],
    queryFn: async () => {
      if (!targetUserId || !companyId) return DEFAULT_PERMISSIONS;

      const res = await apiFetch(`/api/user-permissions?userId=${targetUserId}&companyId=${companyId}`);
      if (!res.ok) throw new Error('Failed to fetch permissions');
      return await res.json();
    },
    enabled: !!targetUserId,
  });

  // Admins always have all permissions
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

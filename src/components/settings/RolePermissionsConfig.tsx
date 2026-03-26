import { useState } from 'react';
import { Loader2, Shield, Users, MessageSquare, FolderKanban, Calendar, DollarSign, Settings } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/useAuth';
import { 
  useRolePermissions, 
  ROLE_LABELS, 
  CONVERSATION_ACCESS_LABELS, 
  RESOURCE_ACCESS_LABELS,
  type RoleType,
  type ConversationAccess,
  type ResourceAccess,
} from '@/hooks/useRolePermissions';

interface RolePermissionsConfigProps {
  companyId?: string;
}

export function RolePermissionsConfig({ companyId: propCompanyId }: RolePermissionsConfigProps = {}) {
  const { companyId: authCompanyId } = useAuth();
  const effectiveCompanyId = propCompanyId || authCompanyId;
  const { 
    rolePermissions, 
    isLoading, 
    updateRolePermission, 
    isUpdating,
    configurableRoles,
    getPermissionByRole,
  } = useRolePermissions(effectiveCompanyId);

  const [updatingRole, setUpdatingRole] = useState<RoleType | null>(null);

  const handlePermissionChange = async (
    role: RoleType,
    field: string,
    value: string | boolean
  ) => {
    setUpdatingRole(role);
    try {
      await updateRolePermission({
        role,
        [field]: value,
      });
    } finally {
      setUpdatingRole(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!rolePermissions || rolePermissions.length === 0) {
    return (
      <div className="text-center py-8">
        <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Nenhuma configuração de permissão encontrada.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="h-4 w-4" />
        <span>Configure as permissões padrão para cada tipo de usuário (role)</span>
      </div>

      {configurableRoles.map((role) => {
        const permission = getPermissionByRole(role);
        if (!permission) return null;

        const isCurrentlyUpdating = updatingRole === role;

        return (
          <Card key={role} className="relative">
            {isCurrentlyUpdating && (
              <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10 rounded-lg">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}
            
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    role === 'manager' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                    role === 'agent' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                    'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  }`}>
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{ROLE_LABELS[role]}</CardTitle>
                    <CardDescription className="text-sm">
                      {role === 'manager' && 'Gerencia equipes e tem acesso amplo aos recursos'}
                      {role === 'agent' && 'Atende clientes e gerencia conversas atribuídas'}
                      {role === 'viewer' && 'Acesso limitado apenas para visualização'}
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="outline">{role}</Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Conversas */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  Conversas
                </div>
                <div className="grid gap-2 pl-6">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-muted-foreground">Acesso às conversas</Label>
                    <Select
                      value={permission.conversation_access}
                      onValueChange={(value) => 
                        handlePermissionChange(role, 'conversation_access', value as ConversationAccess)
                      }
                      disabled={isUpdating}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{CONVERSATION_ACCESS_LABELS.all}</SelectItem>
                        <SelectItem value="assigned_only">{CONVERSATION_ACCESS_LABELS.assigned_only}</SelectItem>
                        <SelectItem value="none">{CONVERSATION_ACCESS_LABELS.none}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* CRM */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FolderKanban className="h-4 w-4 text-muted-foreground" />
                  CRM / Clientes
                </div>
                <div className="grid gap-2 pl-6">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-muted-foreground">Acesso ao CRM</Label>
                    <Select
                      value={permission.crm_access}
                      onValueChange={(value) => 
                        handlePermissionChange(role, 'crm_access', value as ResourceAccess)
                      }
                      disabled={isUpdating}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full">{RESOURCE_ACCESS_LABELS.full}</SelectItem>
                        <SelectItem value="read_only">{RESOURCE_ACCESS_LABELS.read_only}</SelectItem>
                        <SelectItem value="none">{RESOURCE_ACCESS_LABELS.none}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Agendamentos */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Agendamentos
                </div>
                <div className="grid gap-2 pl-6">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-muted-foreground">Acesso aos agendamentos</Label>
                    <Select
                      value={permission.appointments_access}
                      onValueChange={(value) => 
                        handlePermissionChange(role, 'appointments_access', value as ResourceAccess)
                      }
                      disabled={isUpdating}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full">{RESOURCE_ACCESS_LABELS.full}</SelectItem>
                        <SelectItem value="read_only">{RESOURCE_ACCESS_LABELS.read_only}</SelectItem>
                        <SelectItem value="none">{RESOURCE_ACCESS_LABELS.none}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Vendas */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  Vendas
                </div>
                <div className="grid gap-2 pl-6">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-muted-foreground">Acesso às vendas</Label>
                    <Select
                      value={permission.sales_access}
                      onValueChange={(value) => 
                        handlePermissionChange(role, 'sales_access', value as ResourceAccess)
                      }
                      disabled={isUpdating}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full">{RESOURCE_ACCESS_LABELS.full}</SelectItem>
                        <SelectItem value="read_only">{RESOURCE_ACCESS_LABELS.read_only}</SelectItem>
                        <SelectItem value="none">{RESOURCE_ACCESS_LABELS.none}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Configurações */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  Configurações
                </div>
                <div className="grid gap-2 pl-6">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-muted-foreground">Pode editar configurações</Label>
                    <Switch
                      checked={permission.can_edit_settings}
                      onCheckedChange={(checked) => 
                        handlePermissionChange(role, 'can_edit_settings', checked)
                      }
                      disabled={isUpdating}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Nota sobre Company Admin */}
      <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-4 w-4" />
          <span className="font-medium">Nota sobre Administradores</span>
        </div>
        <p>
          Usuários com a role <Badge variant="outline" className="mx-1">company_admin</Badge> 
          têm acesso total a todos os recursos automaticamente e não podem ter suas permissões limitadas.
        </p>
      </div>
    </div>
  );
}

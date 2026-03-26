import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Users, Mail, Phone, MoreVertical, Power, Trash2, KeyRound, Lock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState } from 'react';
import { useCompanyTeam } from '@/hooks/useCompanyTeam';
import { AddUserDialog } from './AddUserDialog';
import { SetPasswordDialog } from './SetPasswordDialog';

interface TeamTabProps {
  companyId: string;
}

export function TeamTab({ companyId }: TeamTabProps) {
  const [userToRemove, setUserToRemove] = useState<string | null>(null);
  const [userToSetPassword, setUserToSetPassword] = useState<{ id: string; name: string } | null>(null);
  
  const {
    teamMembers,
    isLoading,
    addUser,
    isAddingUser,
    toggleStatus,
    removeMember,
    resetPassword,
    isResettingPassword,
    setPassword,
    isSettingPassword,
  } = useCompanyTeam(companyId);
  const roleLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
    super_admin: { label: 'Super Admin', variant: 'destructive' },
    company_admin: { label: 'Admin', variant: 'default' },
    manager: { label: 'Gerente', variant: 'secondary' },
    agent: { label: 'Agente', variant: 'secondary' },
    viewer: { label: 'Visualizador', variant: 'secondary' },
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  const handleRemoveUser = (userId: string) => {
    removeMember(userId);
    setUserToRemove(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Equipe</h3>
          <p className="text-sm text-muted-foreground">
            Membros da empresa e suas funções
          </p>
        </div>
        <AddUserDialog onAddUser={addUser} isLoading={isAddingUser} />
      </div>

      {teamMembers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum usuário</h3>
            <p className="text-muted-foreground text-center">
              Esta empresa ainda não possui usuários cadastrados
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {teamMembers.map((user) => {
            const role = user.user_roles[0]?.role || 'viewer';
            const roleConfig = roleLabels[role] || roleLabels.viewer;

            return (
              <Card key={user.id}>
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={user.avatar_url} />
                      <AvatarFallback>
                        {getInitials(user.full_name || user.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <CardTitle className="text-base">{user.full_name || 'Sem nome'}</CardTitle>
                      <CardDescription className="flex flex-col gap-1 mt-1">
                        <span className="flex items-center gap-2">
                          <Mail className="h-3 w-3" />
                          {user.email}
                        </span>
                        {user.phone && (
                          <span className="flex items-center gap-2">
                            <Phone className="h-3 w-3" />
                            {user.phone}
                          </span>
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={roleConfig.variant}>{roleConfig.label}</Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Ações</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => toggleStatus({ userId: user.id, isActive: user.is_active })}
                          >
                            <Power className="h-4 w-4 mr-2" />
                            {user.is_active ? 'Desativar' : 'Ativar'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setUserToSetPassword({ 
                              id: user.id, 
                              name: user.full_name || user.email 
                            })}
                          >
                            <Lock className="h-4 w-4 mr-2" />
                            Definir Senha
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => resetPassword(user.id)}
                            disabled={isResettingPassword}
                          >
                            <KeyRound className="h-4 w-4 mr-2" />
                            Enviar Email de Redefinição
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setUserToRemove(user.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remover
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Status:</span>
                      <Badge variant={user.is_active ? 'default' : 'secondary'} className="ml-2">
                        {user.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Criado em:</span>
                      <span className="ml-2">
                        {format(new Date(user.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                      </span>
                    </div>
                    {user.last_seen_at && (
                      <div>
                        <span className="text-muted-foreground">Último acesso:</span>
                        <span className="ml-2">
                          {format(new Date(user.last_seen_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!userToRemove} onOpenChange={() => setUserToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Remoção</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este usuário da equipe? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => userToRemove && handleRemoveUser(userToRemove)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SetPasswordDialog
        open={!!userToSetPassword}
        onOpenChange={(open) => !open && setUserToSetPassword(null)}
        userName={userToSetPassword?.name || ''}
        onSetPassword={(password) => {
          if (userToSetPassword) {
            setPassword(
              { userId: userToSetPassword.id, password },
              { onSuccess: () => setUserToSetPassword(null) }
            );
          }
        }}
        isLoading={isSettingPassword}
      />
    </div>
  );
}

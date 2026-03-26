import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, KeyRound } from 'lucide-react';
import { SystemUser } from '@/hooks/useAllUsers';
import { SetPasswordDialog } from '@/components/super-admin/company-details/SetPasswordDialog';

interface UsersTableProps {
  users: SystemUser[];
  onSetPassword: (userId: string, password: string) => void;
  isSettingPassword: boolean;
}

const roleColors: Record<string, string> = {
  super_admin: 'bg-red-500/10 text-red-500 border-red-500/20',
  company_admin: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  manager: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  agent: 'bg-green-500/10 text-green-500 border-green-500/20',
  viewer: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
};

const roleLabels: Record<string, string> = {
  super_admin: 'Super Admin',
  company_admin: 'Admin',
  manager: 'Gerente',
  agent: 'Agente',
  viewer: 'Visualizador',
};

export function UsersTable({ users, onSetPassword, isSettingPassword }: UsersTableProps) {
  const [userToSetPassword, setUserToSetPassword] = useState<{ id: string; name: string } | null>(null);

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    }
    return email.substring(0, 2).toUpperCase();
  };

  const handleSetPassword = (password: string) => {
    if (userToSetPassword) {
      onSetPassword(userToSetPassword.id, password);
      setUserToSetPassword(null);
    }
  };

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[70px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Nenhum usuário encontrado
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {getInitials(user.full_name, user.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{user.full_name || 'Sem nome'}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.company_name ? (
                      <Badge variant="outline">{user.company_name}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">Sem empresa</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.roles.length > 0 ? (
                        user.roles.map((role) => (
                          <Badge
                            key={role}
                            variant="outline"
                            className={roleColors[role] || ''}
                          >
                            {roleLabels[role] || role}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-sm">Sem roles</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.is_active ? 'default' : 'secondary'}>
                      {user.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setUserToSetPassword({ 
                            id: user.id, 
                            name: user.full_name || user.email 
                          })}
                        >
                          <KeyRound className="mr-2 h-4 w-4" />
                          Definir Senha
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <SetPasswordDialog
        open={!!userToSetPassword}
        onOpenChange={(open) => !open && setUserToSetPassword(null)}
        userName={userToSetPassword?.name || ''}
        onSetPassword={handleSetPassword}
        isLoading={isSettingPassword}
      />
    </>
  );
}

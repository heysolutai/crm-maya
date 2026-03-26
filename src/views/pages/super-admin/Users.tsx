import { useState } from 'react';
import { Users as UsersIcon, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useAllUsers } from '@/hooks/useAllUsers';
import { UsersTable } from '@/components/super-admin/UsersTable';
import { Skeleton } from '@/components/ui/skeleton';

export default function Users() {
  const [searchQuery, setSearchQuery] = useState('');
  const { users, isLoading, setPassword, isSettingPassword } = useAllUsers();

  const filteredUsers = users.filter((user) => {
    const query = searchQuery.toLowerCase();
    return (
      user.email.toLowerCase().includes(query) ||
      (user.full_name?.toLowerCase().includes(query) ?? false) ||
      (user.company_name?.toLowerCase().includes(query) ?? false)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UsersIcon className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Usuários</h1>
            <p className="text-muted-foreground">
              Gerencie todos os usuários do sistema
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, email ou empresa..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {filteredUsers.length} usuário(s)
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <UsersTable
          users={filteredUsers}
          onSetPassword={(userId, password) => setPassword({ userId, password })}
          isSettingPassword={isSettingPassword}
        />
      )}
    </div>
  );
}

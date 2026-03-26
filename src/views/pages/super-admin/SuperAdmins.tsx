import { useState } from 'react';
import { Shield, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSuperAdmins } from '@/hooks/useSuperAdmins';
import { SuperAdminsTable } from '@/components/super-admin/SuperAdminsTable';
import { AddSuperAdminDialog } from '@/components/super-admin/AddSuperAdminDialog';

export default function SuperAdmins() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { superAdmins, isLoading, addSuperAdmin, removeSuperAdmin, currentUserId } =
    useSuperAdmins();

  const handleAdd = async (email: string) => {
    await addSuperAdmin.mutateAsync(email);
  };

  const handleRemove = (userId: string) => {
    removeSuperAdmin.mutate(userId);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Super Administradores</h1>
            <p className="text-muted-foreground">
              Gerencie os administradores do sistema
            </p>
          </div>
        </div>

        <Button onClick={() => setIsDialogOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Adicionar Super Admin
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <SuperAdminsTable
          superAdmins={superAdmins}
          currentUserId={currentUserId}
          onRemove={handleRemove}
          isRemoving={removeSuperAdmin.isPending}
        />
      )}

      {/* Dialog */}
      <AddSuperAdminDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onAdd={handleAdd}
        isLoading={addSuperAdmin.isPending}
      />
    </div>
  );
}

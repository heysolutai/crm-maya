import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Trash2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SuperAdmin {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  created_at: string;
}

interface SuperAdminsTableProps {
  superAdmins: SuperAdmin[];
  currentUserId?: string;
  onRemove: (userId: string) => void;
  isRemoving: boolean;
}

export function SuperAdminsTable({
  superAdmins,
  currentUserId,
  onRemove,
  isRemoving,
}: SuperAdminsTableProps) {
  const [confirmRemove, setConfirmRemove] = useState<SuperAdmin | null>(null);

  const handleRemove = () => {
    if (confirmRemove) {
      onRemove(confirmRemove.user_id);
      setConfirmRemove(null);
    }
  };

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return email.charAt(0).toUpperCase();
  };

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Adicionado em</TableHead>
              <TableHead className="w-[100px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {superAdmins.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  Nenhum Super Admin encontrado
                </TableCell>
              </TableRow>
            ) : (
              superAdmins.map((admin) => (
                <TableRow key={admin.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {getInitials(admin.full_name, admin.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {admin.full_name || admin.email.split('@')[0]}
                        </span>
                        {admin.user_id === currentUserId && (
                          <Badge variant="secondary" className="text-xs">
                            Você
                          </Badge>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{admin.email}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(admin.created_at), "dd 'de' MMMM 'de' yyyy", {
                      locale: ptBR,
                    })}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setConfirmRemove(admin)}
                      disabled={admin.user_id === currentUserId || isRemoving}
                      title={
                        admin.user_id === currentUserId
                          ? 'Você não pode remover a si próprio'
                          : 'Remover Super Admin'
                      }
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!confirmRemove} onOpenChange={() => setConfirmRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Super Admin</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover{' '}
              <strong>{confirmRemove?.full_name || confirmRemove?.email}</strong> como Super
              Admin? Esta pessoa perderá acesso ao painel administrativo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={isRemoving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRemoving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

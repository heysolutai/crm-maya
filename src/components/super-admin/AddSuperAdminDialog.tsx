import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface AddSuperAdminDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (email: string) => Promise<void>;
  isLoading: boolean;
}

export function AddSuperAdminDialog({
  open,
  onOpenChange,
  onAdd,
  isLoading,
}: AddSuperAdminDialogProps) {
  const [email, setEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    try {
      await onAdd(email);
      setEmail('');
      onOpenChange(false);
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Adicionar Super Admin</DialogTitle>
            <DialogDescription>
              Digite o email do usuário que deseja promover a Super Admin. 
              O usuário precisa ter uma conta no sistema.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Label htmlFor="email">Email do usuário</Label>
            <Input
              id="email"
              type="email"
              placeholder="usuario@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2"
              disabled={isLoading}
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading || !email.trim()}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Adicionar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

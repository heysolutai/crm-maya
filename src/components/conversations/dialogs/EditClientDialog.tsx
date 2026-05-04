import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Client } from '../types';

interface EditClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client | null;
}

export function EditClientDialog({ open, onOpenChange, client }: EditClientDialogProps) {
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  // Sincroniza form com o cliente atual sempre que o dialog abrir
  useEffect(() => {
    if (open && client) {
      setFirstName(client.first_name || '');
      setLastName(client.last_name || '');
      setPhone(client.phone || '');
      setEmail(client.email || '');
    }
  }, [open, client]);

  const canSubmit = !!client?.id && firstName.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!canSubmit || !client) return;
    setSaving(true);
    try {
      const res = await fetch('/api/clients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: client.id,
          firstName: firstName.trim(),
          lastName: lastName.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao atualizar contato');
      }
      toast.success('Contato atualizado');
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao atualizar contato');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar contato</DialogTitle>
          <DialogDescription>
            Atualize os dados do cliente. Mudancas aparecem em todas as conversas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-client-firstname">Nome *</Label>
            <Input
              id="edit-client-firstname"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Nome"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-client-lastname">Sobrenome</Label>
            <Input
              id="edit-client-lastname"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Sobrenome"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-client-phone">Telefone</Label>
            <Input
              id="edit-client-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="55119..."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-client-email">Email</Label>
            <Input
              id="edit-client-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cliente@exemplo.com"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!canSubmit}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

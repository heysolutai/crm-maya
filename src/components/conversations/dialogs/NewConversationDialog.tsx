import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, MessageCircle } from 'lucide-react';

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateConversation: (phoneNumber: string) => Promise<string | null>;
  isCreating: boolean;
}

export function NewConversationDialog({
  open,
  onOpenChange,
  onCreateConversation,
  isCreating,
}: NewConversationDialogProps) {
  const [phoneNumber, setPhoneNumber] = useState('');

  const handleCreate = async () => {
    const result = await onCreateConversation(phoneNumber);
    if (result) {
      setPhoneNumber('');
      onOpenChange(false);
    }
  };

  const handleClose = () => {
    setPhoneNumber('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Nova Conversa</DialogTitle>
          <DialogDescription>
            Digite o número de telefone para iniciar uma nova conversa.
            O cliente será criado automaticamente se não existir.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Número de Telefone</label>
            <Input
              placeholder="5511999999999"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isCreating) {
                  handleCreate();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Digite o número com código do país (ex: 5511999999999)
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button 
            onClick={handleCreate}
            disabled={!phoneNumber.trim() || isCreating}
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Criando...
              </>
            ) : (
              <>
                <MessageCircle className="h-4 w-4 mr-2" />
                Iniciar Conversa
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

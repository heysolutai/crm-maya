import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface EditSignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentName: string;
  currentSignature: string;
  onSave: (signature: string) => Promise<void>;
}

export function EditSignatureDialog({ 
  open, 
  onOpenChange, 
  agentName,
  currentSignature,
  onSave 
}: EditSignatureDialogProps) {
  const [signature, setSignature] = useState(currentSignature);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(signature);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  // Reset signature when dialog opens
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setSignature(currentSignature);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Assinatura</DialogTitle>
          <DialogDescription>
            Assinatura de {agentName}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="signature">Assinatura de Mensagens</Label>
            <Input
              id="signature"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="Nome que aparecerá nas mensagens"
            />
            <p className="text-xs text-muted-foreground">
              Esta assinatura será adicionada automaticamente ao final de cada mensagem enviada
            </p>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

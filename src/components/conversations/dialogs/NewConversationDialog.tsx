import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, MessageCircle } from 'lucide-react';
import type { CreateConversationInput } from '@/hooks/useCreateConversation';

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateConversation: (input: CreateConversationInput) => Promise<string | null>;
  isCreating: boolean;
}

const SOURCE_OPTIONS = [
  'OLX',
  'Mobiauto',
  'Instagram',
  'Facebook',
  'WhatsApp',
  'Google',
  'Site',
  'Indicação',
  'Anúncio Meta',
  'Loja física',
  'Outros',
];

export function NewConversationDialog({
  open,
  onOpenChange,
  onCreateConversation,
  isCreating,
}: NewConversationDialogProps) {
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [interest, setInterest] = useState('');
  const [source, setSource] = useState<string>('');

  const reset = () => {
    setName('');
    setPhoneNumber('');
    setInterest('');
    setSource('');
  };

  const canSubmit = name.trim().length > 0 && phoneNumber.trim().length > 0 && !isCreating;

  const handleCreate = async () => {
    if (!canSubmit) return;
    const result = await onCreateConversation({
      name,
      phone: phoneNumber,
      interest: interest || undefined,
      source: source || undefined,
    });
    if (result) {
      reset();
      onOpenChange(false);
    }
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Nova Conversa</DialogTitle>
          <DialogDescription>
            Preencha os dados para iniciar uma nova conversa. O cliente é criado ou atualizado automaticamente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Nome <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="Nome do cliente"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Telefone <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="5511999999999"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSubmit) handleCreate();
              }}
            />
            <p className="text-xs text-muted-foreground">
              Com código do país (ex: 5511999999999)
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Interesse</label>
            <Textarea
              placeholder="Ex: Honda CG 160 2022, quer financiar"
              value={interest}
              onChange={(e) => setInterest(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Fonte</label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a origem do contato" />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={!canSubmit}>
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

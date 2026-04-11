import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, Forward, Loader2 } from 'lucide-react';
import { getInitials } from '../types';

interface ConversationLike {
  id: string;
  client?: {
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    avatar_url?: string | null;
  } | null;
}

interface ForwardMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversations: ConversationLike[] | undefined;
  excludeConversationId?: string | null;
  onForward: (targetConversationId: string) => void;
  isForwarding?: boolean;
}

export function ForwardMessageDialog({
  open,
  onOpenChange,
  conversations,
  excludeConversationId,
  onForward,
  isForwarding,
}: ForwardMessageDialogProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const list = (conversations || []).filter((c) => c.id !== excludeConversationId);
    if (!search.trim()) return list;
    const term = search.trim().toLowerCase();
    return list.filter((c) => {
      const name = `${c.client?.first_name ?? ''} ${c.client?.last_name ?? ''}`.toLowerCase();
      const phone = (c.client?.phone ?? '').toLowerCase();
      return name.includes(term) || phone.includes(term);
    });
  }, [conversations, excludeConversationId, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Forward className="h-4 w-4" />
            Encaminhar mensagem
          </DialogTitle>
          <DialogDescription>Selecione a conversa de destino.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhuma conversa encontrada
            </p>
          ) : (
            filtered.map((conv) => {
              const name = `${conv.client?.first_name ?? ''} ${conv.client?.last_name ?? ''}`.trim() || 'Sem nome';
              const phone = conv.client?.phone || '';
              return (
                <Button
                  key={conv.id}
                  variant="ghost"
                  disabled={isForwarding}
                  className="w-full justify-start h-auto py-2"
                  onClick={() => onForward(conv.id)}
                >
                  <Avatar className="h-8 w-8 mr-3 shrink-0">
                    <AvatarImage src={conv.client?.avatar_url || undefined} alt={name} />
                    <AvatarFallback className="text-xs">{getInitials(name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-left min-w-0">
                    <div className="font-medium truncate">{name}</div>
                    <div className="text-xs text-muted-foreground truncate">{phone}</div>
                  </div>
                  {isForwarding && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                </Button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

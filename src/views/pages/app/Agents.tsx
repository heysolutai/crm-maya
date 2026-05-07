import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAgents, type Agent } from '@/hooks/useAgents';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { CardListSkeleton } from '@/components/ui/table-skeleton';
import {
  Bot,
  Plus,
  Trash2,
  Loader2,
  Smartphone,
  Cloud,
  Instagram,
  Zap,
} from 'lucide-react';
import { CHANNEL_REGISTRY, type ChannelType } from '@/lib/channels/types';
import { cn } from '@/lib/utils';

const channelIcon: Record<ChannelType, typeof Smartphone> = {
  uazapi: Smartphone,
  evolution_baileys: Zap,
  evolution_go: Zap,
  zapi: Zap,
  whatsapp_cloud: Cloud,
  instagram: Instagram,
};

const statusStyles: Record<string, { dot: string; label: string }> = {
  connected: { dot: 'bg-emerald-500', label: 'Conectado' },
  connecting: { dot: 'bg-amber-500', label: 'Conectando' },
  disconnected: { dot: 'bg-gray-400', label: 'Desconectado' },
  error: { dot: 'bg-rose-500', label: 'Erro' },
};

export default function Agents() {
  const router = useRouter();
  const { agents, isLoading, createAgent, deleteAgent, isCreating, isDeleting } = useAgents();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<ChannelType | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });

  const channels = Object.values(CHANNEL_REGISTRY);

  const handleCreate = () => {
    if (!selectedChannel || !displayName.trim()) return;
    createAgent(
      { channelType: selectedChannel, displayName: displayName.trim() },
      {
        onSuccess: (agent: Agent) => {
          setDialogOpen(false);
          setSelectedChannel(null);
          setDisplayName('');
          router.push(`/app/agents/${agent.id}`);
        },
      }
    );
  };

  const handleCardClick = (agentId: string) => {
    router.push(`/app/agents/${agentId}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bot className="h-7 w-7" />
            Agentes
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie agentes, canais de atendimento e configurações de IA
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Agente
        </Button>
      </div>

      {isLoading ? (
        <CardListSkeleton count={3} />
      ) : agents.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="Nenhum agente cadastrado"
          description="Crie seu primeiro agente conectando um canal de atendimento."
          actionLabel="Criar Agente"
          onAction={() => setDialogOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => {
            const Icon = channelIcon[agent.channel_type] || Smartphone;
            const channelMeta = CHANNEL_REGISTRY[agent.channel_type];
            const status = statusStyles[agent.status || 'disconnected'] || statusStyles.disconnected;
            return (
              <Card
                key={agent.id}
                className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group relative"
                onClick={() => handleCardClick(agent.id)}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{agent.display_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {channelMeta?.label || agent.channel_type}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm({ open: true, id: agent.id });
                      }}
                      aria-label="Remover agente"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className={cn('h-2 w-2 rounded-full shrink-0', status.dot)} />
                      <span className="text-xs">{status.label}</span>
                    </div>
                    {agent.phone_number ? (
                      <p className="font-mono text-xs text-muted-foreground">
                        {formatPhone(agent.phone_number)}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">Sem número conectado</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setSelectedChannel(null);
            setDisplayName('');
          }
        }}
      >
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Novo Agente</DialogTitle>
            <DialogDescription>
              Escolha o canal e dê um nome para o seu agente. Cada agente terá seu próprio número
              e configuração de IA.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Canal</Label>
              <div className="grid grid-cols-2 gap-2">
                {channels.map((c) => {
                  const Icon = channelIcon[c.type] || Smartphone;
                  const isSelected = selectedChannel === c.type;
                  const disabled = c.status === 'coming_soon';
                  return (
                    <button
                      key={c.type}
                      type="button"
                      disabled={disabled}
                      onClick={() => !disabled && setSelectedChannel(c.type)}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border p-3 text-left transition-all',
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-foreground/20',
                        disabled && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{c.label}</p>
                          {disabled && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                              Em breve
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-name">Nome do agente</Label>
              <Input
                id="agent-name"
                placeholder="Ex: Atendimento, Comercial, Pós-venda"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Use um nome interno para identificar o agente. O número aparece após a conexão.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!selectedChannel || !displayName.trim() || isCreating}
            >
              {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar agente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) =>
          setDeleteConfirm({ open, id: open ? deleteConfirm.id : null })
        }
        title="Remover agente"
        description="O agente será desconectado e excluído. Conversas existentes não são apagadas."
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={() => {
          if (deleteConfirm.id) {
            deleteAgent(deleteConfirm.id);
            setDeleteConfirm({ open: false, id: null });
          }
        }}
      />
    </div>
  );
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 13) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return digits;
}

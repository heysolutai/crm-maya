import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAgents, type Agent } from '@/hooks/useAgents';
import { useChannelCredentials } from '@/hooks/useChannelCredentials';
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
  CheckCircle2,
  Pencil,
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
  const { credentialFor, hasCredentialFor } = useChannelCredentials();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<ChannelType | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [serverApiKey, setServerApiKey] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  // Quando ja existe credencial salva, escondemos os campos por padrao;
  // user pode clicar em "Editar" pra trocar URL/token.
  const [editingCredential, setEditingCredential] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });

  const channels = Object.values(CHANNEL_REGISTRY);

  // Canais que precisam de URL + API key/admin token do servidor self-hosted.
  // UazAPI tambem entra: novos agentes pegam admin token do form (nao mais do .env).
  const needsServerConfig =
    selectedChannel &&
    ['uazapi', 'evolution_baileys', 'evolution_go', 'zapi'].includes(selectedChannel);

  const savedCred = selectedChannel ? credentialFor(selectedChannel) : undefined;
  const hasSavedCred = !!savedCred;

  // Decide se os inputs de URL/token devem aparecer:
  //  - Canal nao precisa de config → nunca
  //  - Canal precisa + nao tem credencial salva → sim (1a vez)
  //  - Canal precisa + tem credencial salva + user clicou em editar → sim
  //  - Canal precisa + tem credencial salva + user nao editou → nao (usa salva)
  const showCredentialInputs = !!needsServerConfig && (!hasSavedCred || editingCredential);

  const resetForm = () => {
    setSelectedChannel(null);
    setDisplayName('');
    setServerUrl('');
    setServerApiKey('');
    setPhoneNumber('');
    setEditingCredential(false);
  };

  const handleSelectChannel = (type: ChannelType) => {
    setSelectedChannel(type);
    // Limpa inputs quando troca de canal — pra nao mandar credencial errada
    setServerUrl('');
    setServerApiKey('');
    setEditingCredential(false);
  };

  const handleCreate = () => {
    if (!selectedChannel || !displayName.trim()) return;

    // Se canal precisa de config e a UI esta exibindo inputs, ambos sao obrigatorios
    if (showCredentialInputs && (!serverUrl.trim() || !serverApiKey.trim())) return;

    createAgent(
      {
        channelType: selectedChannel,
        displayName: displayName.trim(),
        // Manda URL/token apenas se o user explicitamente preencheu
        // (1a vez ou edicao). Se nao mandou, o backend usa a credencial salva.
        serverUrl: showCredentialInputs ? serverUrl.trim() : undefined,
        serverApiKey: showCredentialInputs ? serverApiKey.trim() : undefined,
        phoneNumber: phoneNumber.trim() || undefined,
      },
      {
        onSuccess: (agent: Agent) => {
          setDialogOpen(false);
          resetForm();
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
          if (!open) resetForm();
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
                      onClick={() => !disabled && handleSelectChannel(c.type)}
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

            {needsServerConfig && selectedChannel && (
              <div className="space-y-3 rounded-lg border border-dashed p-3 bg-muted/30">
                {hasSavedCred && !editingCredential ? (
                  // Banner mostrando credencial reaproveitada
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Conexão já configurada</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {savedCred?.server_url}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Token: <span className="font-mono">{savedCred?.server_api_key}</span>
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 shrink-0"
                        onClick={() => setEditingCredential(true)}
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        Editar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="server-url">URL do servidor</Label>
                      <Input
                        id="server-url"
                        placeholder={
                          selectedChannel === 'uazapi'
                            ? 'https://heysolut.uazapi.com'
                            : 'https://api.evolution.exemplo.com'
                        }
                        value={serverUrl}
                        onChange={(e) => setServerUrl(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="server-key">
                        {selectedChannel === 'uazapi' ? 'Admin Token' : 'API Key (global)'}
                      </Label>
                      <Input
                        id="server-key"
                        type="password"
                        placeholder={
                          selectedChannel === 'uazapi'
                            ? 'Admin token do servidor UazAPI'
                            : 'AUTHENTICATION_API_KEY do seu servidor Evolution'
                        }
                        value={serverApiKey}
                        onChange={(e) => setServerApiKey(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Salvo na empresa após o primeiro agente — não precisa preencher de novo.
                      </p>
                    </div>
                    {hasSavedCred && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => {
                          setEditingCredential(false);
                          setServerUrl('');
                          setServerApiKey('');
                        }}
                      >
                        Cancelar e usar credencial salva
                      </Button>
                    )}
                  </>
                )}
                {selectedChannel !== 'uazapi' && (
                  <div className="space-y-2">
                    <Label htmlFor="phone-hint" className="text-muted-foreground">
                      Número (opcional, para pairing code)
                    </Label>
                    <Input
                      id="phone-hint"
                      placeholder="5511999999999"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                !selectedChannel ||
                !displayName.trim() ||
                (showCredentialInputs && (!serverUrl.trim() || !serverApiKey.trim())) ||
                isCreating
              }
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

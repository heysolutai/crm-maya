import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useInboxes, type Inbox } from '@/hooks/useInboxes';
import { useAiAgents } from '@/hooks/useAiAgents';
import { useChannelCredentials } from '@/hooks/useChannelCredentials';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Inbox as InboxIcon,
  Plus,
  Trash2,
  Loader2,
  Smartphone,
  Cloud,
  Instagram,
  Zap,
  CheckCircle2,
  Pencil,
  Bot,
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
  notificame: Cloud,
};

const statusStyles: Record<string, { dot: string; label: string }> = {
  connected: { dot: 'bg-emerald-500', label: 'Conectado' },
  connecting: { dot: 'bg-amber-500', label: 'Conectando' },
  disconnected: { dot: 'bg-gray-400', label: 'Desconectado' },
  error: { dot: 'bg-rose-500', label: 'Erro' },
};

type AiAgentMode = 'reuse' | 'create' | 'none';

export default function Inboxes() {
  const router = useRouter();
  const { inboxes, isLoading, createInbox, deleteInbox, isCreating, isDeleting } = useInboxes();
  const { aiAgents } = useAiAgents();
  const { credentialFor, hasCredentialFor } = useChannelCredentials();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<ChannelType | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [serverApiKey, setServerApiKey] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  // NotificaMe extras (channelId + channelToken vao em `extra` no POST)
  const [notificameChannelId, setNotificameChannelId] = useState('');
  // channelToken: token DO CANAL, usado como `from` no sendMessage (so WhatsApp exige).
  const [notificameChannelToken, setNotificameChannelToken] = useState('');
  const [notificameChannels, setNotificameChannels] = useState<
    Array<{ id: string; name?: string; type?: string; status?: string; channelToken?: string }>
  >([]);
  const [notificameLoadingChannels, setNotificameLoadingChannels] = useState(false);
  const [notificameChannelsError, setNotificameChannelsError] = useState<string | null>(null);
  // Quando ja existe credencial salva, escondemos os campos por padrao;
  // user pode clicar em "Editar" pra trocar URL/token.
  const [editingCredential, setEditingCredential] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });

  // Estado do bloco "Agente IA" no dialog
  const [aiAgentMode, setAiAgentMode] = useState<AiAgentMode>('reuse');
  const [selectedAiAgentId, setSelectedAiAgentId] = useState<string>('');
  const [newAiAgentName, setNewAiAgentName] = useState('');

  const channels = Object.values(CHANNEL_REGISTRY);

  // Canais que precisam de URL + API key/admin token do servidor self-hosted.
  // UazAPI tambem entra: novas inboxes pegam admin token do form (nao mais do .env).
  const needsServerConfig =
    selectedChannel &&
    ['uazapi', 'evolution_baileys', 'evolution_go', 'zapi'].includes(selectedChannel);

  const isNotificame = selectedChannel === 'notificame';

  // Tipo do canal selecionado no dropdown do NotificaMe (whatsapp/instagram/facebook/...).
  // Define se exigimos o "Token do Canal" (so WhatsApp).
  const selectedNotificameChannel = notificameChannels.find((c) => c.id === notificameChannelId);
  const selectedNotificameType = (selectedNotificameChannel?.type || 'whatsapp').toLowerCase();
  const notificameNeedsChannelToken = isNotificame && selectedNotificameType === 'whatsapp';

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
    setNotificameChannelId('');
    setNotificameChannelToken('');
    setNotificameChannels([]);
    setNotificameChannelsError(null);
    setEditingCredential(false);
    setAiAgentMode('reuse');
    setSelectedAiAgentId('');
    setNewAiAgentName('');
  };

  const handleSelectChannel = (type: ChannelType) => {
    setSelectedChannel(type);
    // Limpa inputs quando troca de canal — pra nao mandar credencial errada
    setServerUrl('');
    setServerApiKey('');
    setNotificameChannelId('');
    setNotificameChannelToken('');
    setNotificameChannels([]);
    setNotificameChannelsError(null);
    setEditingCredential(false);
  };

  const fetchNotificameChannels = async () => {
    const token = serverApiKey.trim() || savedCred?.server_api_key || '';
    if (!token) {
      setNotificameChannelsError('Informe o API Token primeiro');
      return;
    }
    setNotificameLoadingChannels(true);
    setNotificameChannelsError(null);
    try {
      const res = await fetch('/api/channels/notificame/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken: token }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao listar canais');
      }
      const list = Array.isArray(data.channels) ? data.channels : [];
      setNotificameChannels(list);
      if (list.length === 0) {
        setNotificameChannelsError('Nenhum canal encontrado nessa conta');
      } else if (!notificameChannelId && list.length === 1) {
        // Auto-seleciona se so tem um
        setNotificameChannelId(list[0].id);
        // Auto-popula channelToken se o NotificaMe expos
        if (list[0].channelToken) setNotificameChannelToken(list[0].channelToken);
      }
    } catch (e) {
      setNotificameChannelsError((e as Error).message);
      setNotificameChannels([]);
    } finally {
      setNotificameLoadingChannels(false);
    }
  };

  const handleCreate = () => {
    if (!selectedChannel || !displayName.trim()) return;

    // Se canal precisa de config e a UI esta exibindo inputs, ambos sao obrigatorios
    if (showCredentialInputs && (!serverUrl.trim() || !serverApiKey.trim())) return;

    // NotificaMe: token de conta + channelId sempre obrigatorios. Token do Canal
    // so e exigido quando o canal escolhido eh WhatsApp (eh o `from` do sendMessage).
    const notificameNeedsInputs = isNotificame && (!hasSavedCred || editingCredential);
    if (notificameNeedsInputs && !serverApiKey.trim()) return;
    if (isNotificame && !notificameChannelId.trim()) return;
    if (notificameNeedsChannelToken && !notificameChannelToken.trim()) return;

    createInbox(
      {
        channelType: selectedChannel,
        displayName: displayName.trim(),
        // Manda URL/token apenas se o user explicitamente preencheu
        // (1a vez ou edicao). Se nao mandou, o backend usa a credencial salva.
        serverUrl: showCredentialInputs ? serverUrl.trim() : undefined,
        serverApiKey: showCredentialInputs || notificameNeedsInputs
          ? serverApiKey.trim()
          : undefined,
        phoneNumber: phoneNumber.trim() || undefined,
        // NotificaMe-specific extras
        extra: isNotificame
          ? {
              channelId: notificameChannelId.trim(),
              // Tipo do canal vem da listagem (whatsapp/instagram/facebook/...).
              channel: selectedNotificameType,
              // Token do canal: usado como `from` no sendMessage. Obrigatorio
              // apenas pra WhatsApp; Instagram/Facebook usam o proprio channelId.
              channelToken: notificameNeedsChannelToken
                ? notificameChannelToken.trim()
                : undefined,
            }
          : undefined,
        // 1:1 — cada conexao cria seu proprio agente dedicado automaticamente
        // (backend ensureInboxAiAgent). Nao enviamos aiAgentId/createAiAgentNamed.
      },
      {
        onSuccess: (inbox: Inbox) => {
          setDialogOpen(false);
          resetForm();
          router.push(`/app/inboxes/${inbox.id}`);
        },
      }
    );
  };

  const handleCardClick = (inboxId: string) => {
    router.push(`/app/inboxes/${inboxId}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <InboxIcon className="h-7 w-7" />
            Caixas de entrada
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie canais de atendimento e seus agentes IA vinculados
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nova caixa de entrada
        </Button>
      </div>

      {isLoading ? (
        <CardListSkeleton count={3} />
      ) : inboxes.length === 0 ? (
        <EmptyState
          icon={InboxIcon}
          title="Nenhuma caixa de entrada cadastrada"
          description="Crie sua primeira caixa de entrada conectando um canal de atendimento."
          actionLabel="Criar caixa de entrada"
          onAction={() => setDialogOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {inboxes.map((inbox) => {
            const Icon = channelIcon[inbox.channel_type] || Smartphone;
            const channelMeta = CHANNEL_REGISTRY[inbox.channel_type];
            const status = statusStyles[inbox.status || 'disconnected'] || statusStyles.disconnected;
            return (
              <Card
                key={inbox.id}
                className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group relative"
                onClick={() => handleCardClick(inbox.id)}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{inbox.display_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {channelMeta?.label || inbox.channel_type}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm({ open: true, id: inbox.id });
                      }}
                      aria-label="Remover caixa de entrada"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className={cn('h-2 w-2 rounded-full shrink-0', status.dot)} />
                      <span className="text-xs">{status.label}</span>
                    </div>
                    {inbox.phone_number ? (
                      <p className="font-mono text-xs text-muted-foreground">
                        {formatPhone(inbox.phone_number)}
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
            <DialogTitle>Nova caixa de entrada</DialogTitle>
            <DialogDescription>
              Escolha o canal e dê um nome para a caixa de entrada. Cada caixa pode usar um agente IA próprio
              ou compartilhar um agente existente.
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
              <Label htmlFor="inbox-name">Nome da caixa de entrada</Label>
              <Input
                id="inbox-name"
                placeholder="Ex: Atendimento, Comercial, Pós-venda"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Use um nome interno para identificar a caixa. O número aparece após a conexão.
              </p>
            </div>

            {isNotificame && (
              <div className="space-y-3 rounded-lg border border-dashed p-3 bg-muted/30">
                {hasSavedCred && !editingCredential ? (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Token NotificaMe já configurado</p>
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
                  <div className="space-y-2">
                    <Label htmlFor="notificame-token">API Token NotificaMe</Label>
                    <Input
                      id="notificame-token"
                      type="text"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      data-1p-ignore
                      data-lpignore="true"
                      placeholder="Token gerado no painel hub.notificame.com.br"
                      value={serverApiKey}
                      onChange={(e) => setServerApiKey(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Header X-API-Token. Salvo na empresa após a primeira caixa.
                    </p>
                  </div>
                )}
                <div className="space-y-2">
                  <div className="flex items-end justify-between gap-2">
                    <Label htmlFor="notificame-channel-id">Canal</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={fetchNotificameChannels}
                      disabled={notificameLoadingChannels || (!serverApiKey.trim() && !savedCred?.server_api_key)}
                    >
                      {notificameLoadingChannels && (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      )}
                      {notificameChannels.length > 0 ? 'Recarregar' : 'Buscar canais'}
                    </Button>
                  </div>
                  {notificameChannels.length > 0 ? (
                    <Select
                      value={notificameChannelId}
                      onValueChange={(id) => {
                        setNotificameChannelId(id);
                        // Auto-popula channelToken se a API expos ele na listagem
                        const picked = notificameChannels.find((c) => c.id === id);
                        if (picked?.channelToken) {
                          setNotificameChannelToken(picked.channelToken);
                        }
                      }}
                    >
                      <SelectTrigger id="notificame-channel-id">
                        <SelectValue placeholder="Selecione um canal" />
                      </SelectTrigger>
                      <SelectContent>
                        {notificameChannels.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name || c.type || c.id}
                            {c.type && c.name ? ` (${c.type})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="notificame-channel-id"
                      placeholder="Clique em Buscar canais ou cole o UUID manualmente"
                      value={notificameChannelId}
                      onChange={(e) => setNotificameChannelId(e.target.value)}
                    />
                  )}
                  {notificameChannelsError && (
                    <p className="text-xs text-rose-600">{notificameChannelsError}</p>
                  )}
                  {!notificameChannelsError && notificameChannels.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Preenche o token e clica em Buscar canais pra listar os disponíveis.
                    </p>
                  )}
                </div>
                {notificameNeedsChannelToken && (
                  <div className="space-y-2">
                    <Label htmlFor="notificame-channel-token">Token do Canal (WhatsApp)</Label>
                    <Input
                      id="notificame-channel-token"
                      type="text"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      data-1p-ignore
                      data-lpignore="true"
                      placeholder="Token específico do canal (diferente do API Token da conta)"
                      value={notificameChannelToken}
                      onChange={(e) => setNotificameChannelToken(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Usado como <code>from</code> no envio. Pegue em hub.notificame.com.br &gt; canal &gt; token.
                      Instagram/Facebook não precisam — usam o próprio ID do canal.
                    </p>
                  </div>
                )}
              </div>
            )}

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
                        Salvo na empresa após a primeira caixa — não precisa preencher de novo.
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

            {/* 1:1 — cada conexao ja cria seu proprio Agente IA dedicado
                (backend ensureInboxAiAgent). A config da IA fica na propria
                conexao, na aba "Prompts". Por isso nao pedimos agente aqui. */}
            <div className="rounded-lg border border-dashed p-3 bg-muted/30 flex items-start gap-2">
              <Bot className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Esta conexão terá seu próprio Agente IA, criado automaticamente.
                Você configura os prompts depois, na aba <strong>Prompts</strong> da conexão.
              </p>
            </div>
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
                (isNotificame &&
                  (!notificameChannelId.trim() ||
                    ((!hasSavedCred || editingCredential) && !serverApiKey.trim()) ||
                    (notificameNeedsChannelToken && !notificameChannelToken.trim()))) ||
                isCreating
              }
            >
              {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar caixa de entrada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) =>
          setDeleteConfirm({ open, id: open ? deleteConfirm.id : null })
        }
        title="Remover caixa de entrada"
        description="A caixa será desconectada e excluída. Conversas existentes não são apagadas."
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={() => {
          if (deleteConfirm.id) {
            deleteInbox(deleteConfirm.id);
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

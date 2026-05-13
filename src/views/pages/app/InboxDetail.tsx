import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useInboxes, useInboxAiAgent } from '@/hooks/useInboxes';
import { useAiAgents } from '@/hooks/useAiAgents';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  Bot,
  Loader2,
  Smartphone,
  Cloud,
  Instagram,
  Zap,
  Plug,
  ExternalLink,
  Inbox as InboxIcon,
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

const statusStyles: Record<string, { dot: string; label: string; badge: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  connected: { dot: 'bg-emerald-500', label: 'Conectado', badge: 'default' },
  connecting: { dot: 'bg-amber-500', label: 'Conectando', badge: 'secondary' },
  disconnected: { dot: 'bg-gray-400', label: 'Desconectado', badge: 'outline' },
  error: { dot: 'bg-rose-500', label: 'Erro', badge: 'destructive' },
};

const tabs = [
  { id: 'connection', label: 'Conexão', icon: Plug },
  { id: 'ai-agent', label: 'Agente IA', icon: Bot },
];

interface Props {
  inboxId: string;
}

export default function InboxDetail({ inboxId }: Props) {
  const router = useRouter();
  const { inboxes, isLoading } = useInboxes();
  const [activeTab, setActiveTab] = useState('connection');

  const inbox = inboxes.find((a) => a.id === inboxId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!inbox) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.push('/app/inboxes')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para caixas de entrada
        </Button>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <InboxIcon className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Caixa de entrada não encontrada</h2>
          <p className="text-muted-foreground">
            Esta caixa de entrada não existe ou você não tem permissão para acessá-la.
          </p>
        </div>
      </div>
    );
  }

  const Icon = channelIcon[inbox.channel_type] || Smartphone;
  const channelMeta = CHANNEL_REGISTRY[inbox.channel_type];
  const status = statusStyles[inbox.status || 'disconnected'] || statusStyles.disconnected;

  const renderContent = () => {
    switch (activeTab) {
      case 'connection':
        return <ConnectionTab inbox={inbox} />;
      case 'ai-agent':
        return <AiAgentTab inbox={inbox} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/app/inboxes')}
          className="mb-4 -ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Caixas de entrada
        </Button>

        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="h-7 w-7 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-bold truncate">{inbox.display_name}</h1>
              <Badge variant={status.badge} className="shrink-0">
                <span className={cn('h-2 w-2 rounded-full mr-1.5', status.dot)} />
                {status.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {channelMeta?.label}
              {inbox.phone_number && (
                <>
                  {' · '}
                  <span className="font-mono">{inbox.phone_number}</span>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="md:hidden">
        <div className="overflow-x-auto -mx-4 px-4 pb-3">
          <div className="flex gap-2 w-max">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap border',
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:bg-muted'
                )}
              >
                <tab.icon className="h-4 w-4 shrink-0" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">{renderContent()}</div>
      </div>

      <div className="hidden md:flex gap-6">
        <nav className="w-56 shrink-0 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left',
                activeTab === tab.id
                  ? 'bg-primary/10 text-primary border-l-2 border-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <tab.icon className="h-4 w-4 shrink-0" />
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="flex-1 min-w-0">{renderContent()}</div>
      </div>
    </div>
  );
}

function AiAgentTab({ inbox }: { inbox: ReturnType<typeof useInboxes>['inboxes'][number] }) {
  const router = useRouter();
  const { aiAgents } = useAiAgents();
  const { updateInbox, isUpdating } = useInboxes();
  const { data: linkedAgent, isLoading: loadingLinked } = useInboxAiAgent(inbox.id);
  const [selectedId, setSelectedId] = useState<string>('');

  const currentAgent = linkedAgent || aiAgents.find((a) => a.id === inbox.ai_agent_id);

  const handleChange = (value: string) => {
    const newId = value === 'none' ? null : value;
    setSelectedId(value);
    updateInbox({ id: inbox.id, aiAgentId: newId });
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Agente IA vinculado
          </h3>
          <p className="text-sm text-muted-foreground">
            Esta caixa de entrada usa o agente IA selecionado para responder automaticamente.
          </p>
        </div>

        {loadingLinked ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando agente vinculado...
          </div>
        ) : currentAgent ? (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground">Agente atual</p>
                <p className="font-semibold text-base truncate">{currentAgent.name}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/app/ai-agents/${currentAgent.id}`)}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Editar agente
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center space-y-2">
            <Bot className="h-8 w-8 mx-auto text-muted-foreground/50" />
            <p className="text-sm font-medium">Nenhum agente IA vinculado</p>
            <p className="text-xs text-muted-foreground">
              Selecione um agente IA abaixo para que ele responda nesta caixa.
            </p>
          </div>
        )}

        <div className="space-y-2 pt-2 border-t">
          <label className="text-sm font-medium" htmlFor="change-ai-agent">
            Trocar agente IA
          </label>
          <Select
            value={selectedId || inbox.ai_agent_id || 'none'}
            onValueChange={handleChange}
            disabled={isUpdating}
          >
            <SelectTrigger id="change-ai-agent">
              <SelectValue placeholder="Selecione um agente IA" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem agente IA</SelectItem>
              {aiAgents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted-foreground">
              Vários inboxes podem compartilhar o mesmo agente IA.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/app/ai-agents')}
            >
              Gerenciar agentes IA
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ConnectionTab({ inbox }: { inbox: ReturnType<typeof useInboxes>['inboxes'][number] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const channelMeta = CHANNEL_REGISTRY[inbox.channel_type];
  const isAvailable = channelMeta?.status === 'available';
  const isTokenMode = channelMeta?.connectionMode === 'token';

  const [qrLoading, setQrLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  const isConnected = inbox.status === 'connected';
  const isConnecting = inbox.status === 'connecting' && !!inbox.qr_code;

  // Polling de status enquanto estiver "connecting" — checa a cada 4s
  useEffect(() => {
    if (inbox.status !== 'connecting') return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/agents/${inbox.id}/status`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'connected' || data.status === 'disconnected') {
          queryClient.invalidateQueries({ queryKey: ['inboxes'] });
        }
      } catch {
        /* silencioso — proximo tick tenta de novo */
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [inbox.status, inbox.id, queryClient]);

  const handleGenerateQr = async () => {
    setQrLoading(true);
    try {
      const res = await fetch(`/api/agents/${inbox.id}/qr`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao gerar QR');
      setPairingCode(data.pairing_code || null);
      queryClient.invalidateQueries({ queryKey: ['inboxes'] });
    } catch (e: any) {
      toast({ title: 'Erro ao gerar QR', description: e.message, variant: 'destructive' });
    } finally {
      setQrLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch(`/api/agents/${inbox.id}/disconnect`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Falha ao desconectar');
      }
      queryClient.invalidateQueries({ queryKey: ['inboxes'] });
      toast({ title: 'Caixa de entrada desconectada' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  };

  if (!isAvailable) {
    return (
      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Conexão do canal</h3>
            <p className="text-sm text-muted-foreground">{channelMeta?.description}</p>
          </div>
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Plug className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
            <p className="font-medium">Canal em desenvolvimento</p>
            <p className="text-sm text-muted-foreground mt-1">
              O adapter para <strong>{channelMeta?.label}</strong> ainda não foi implementado.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div>
          <h3 className="text-lg font-semibold">Conexão do canal</h3>
          <p className="text-sm text-muted-foreground">{channelMeta?.description}</p>
        </div>

        {inbox.api_url && (
          <div className="text-xs text-muted-foreground space-y-1">
            <div>
              <span className="font-medium">Servidor:</span>{' '}
              <span className="font-mono">{inbox.api_url}</span>
            </div>
            <div>
              <span className="font-medium">Instância:</span>{' '}
              <span className="font-mono">{inbox.instance_name}</span>
            </div>
          </div>
        )}

        {inbox.error_message && inbox.status !== 'connected' && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <p className="font-medium">Último erro do provider:</p>
            <p className="text-xs mt-1 break-words">{inbox.error_message}</p>
          </div>
        )}

        {isTokenMode ? (
          <div className="rounded-lg border bg-muted/30 p-6 space-y-3 text-center">
            <Cloud className="h-10 w-10 mx-auto text-muted-foreground" />
            <div>
              <p className="font-medium">
                {isConnected ? 'Canal ativo via API token' : 'Canal configurado via API token'}
              </p>
              <p className="text-sm text-muted-foreground">
                Sem QR Code — autenticação via token na API NotificaMe. Status sincroniza automaticamente.
              </p>
            </div>
            {inbox.channel_config &&
              typeof inbox.channel_config === 'object' &&
              (inbox.channel_config as any)?.channelId && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">Channel UUID: </span>
                  <span className="font-mono">{(inbox.channel_config as any).channelId}</span>
                </div>
              )}
          </div>
        ) : isConnected ? (
          <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 p-6 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center mx-auto">
              <Smartphone className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="font-semibold">Conectado</p>
              {inbox.phone_number && (
                <p className="text-sm text-muted-foreground font-mono">{inbox.phone_number}</p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Desconectar
            </Button>
          </div>
        ) : isConnecting && inbox.qr_code ? (
          <div className="rounded-lg border bg-muted/30 p-6 space-y-4 text-center">
            <div className="border-4 border-foreground rounded-lg p-3 bg-background inline-block">
              <img src={inbox.qr_code} alt="QR Code" className="w-64 h-64" />
            </div>
            {pairingCode && (
              <div className="text-sm">
                <p className="text-muted-foreground">Ou use o pairing code:</p>
                <p className="font-mono text-lg font-semibold tracking-wider">{pairingCode}</p>
              </div>
            )}
            <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Aguardando conexão...</span>
            </div>
            <div className="text-xs text-muted-foreground space-y-1 text-left max-w-xs mx-auto">
              <p className="font-medium text-center">Como conectar:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Abra o WhatsApp no celular</li>
                <li>
                  Toque em <strong>Mais opções → Aparelhos conectados</strong>
                </li>
                <li>
                  Toque em <strong>Conectar um aparelho</strong>
                </li>
                <li>Aponte para esta tela</li>
              </ol>
            </div>
            <Button variant="outline" size="sm" onClick={handleGenerateQr} disabled={qrLoading}>
              {qrLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Gerar novo QR
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border bg-muted/30 p-6 text-center space-y-3">
            <Smartphone className="h-10 w-10 mx-auto text-muted-foreground" />
            <div>
              <p className="font-medium">Pronto para conectar</p>
              <p className="text-sm text-muted-foreground">
                Gere o QR Code para vincular esta caixa de entrada ao WhatsApp.
              </p>
            </div>
            <Button onClick={handleGenerateQr} disabled={qrLoading}>
              {qrLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Gerar QR Code
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

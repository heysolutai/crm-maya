import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAgents } from '@/hooks/useAgents';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Bot,
  Loader2,
  Smartphone,
  Cloud,
  Instagram,
  Zap,
  MessageSquareText,
  BookOpen,
  Key,
  Settings as SettingsIcon,
  FlaskConical,
  Plug,
} from 'lucide-react';
import { AIPromptsEditor } from '@/components/ai';
import { FAQManager } from '@/components/settings/FAQManager';
import { SettingsSubTab } from '@/components/super-admin/company-details/ai-config/SettingsSubTab';
import { APIKeysSubTab } from '@/components/super-admin/company-details/ai-config/APIKeysSubTab';
import { PlaygroundChat } from '@/components/ai/PlaygroundChat';
import { CHANNEL_REGISTRY, type ChannelType } from '@/lib/channels/types';
import { cn } from '@/lib/utils';
import type { AIPermissionKey } from '@/components/super-admin/company-details/AIPermissionsConfig';

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

const fixedTabs = [
  { id: 'connection', label: 'Conexão', icon: Plug },
  { id: 'prompts', label: 'Prompts', icon: MessageSquareText, permKey: 'prompts' as AIPermissionKey },
  { id: 'faq', label: 'FAQ', icon: BookOpen, permKey: 'faq' as AIPermissionKey },
];

const restrictedTabs = [
  { id: 'integrations', label: 'Integrações', icon: Key, permKey: 'integrations' as AIPermissionKey },
  { id: 'settings', label: 'Ajustes', icon: SettingsIcon, permKey: 'settings' as AIPermissionKey },
  { id: 'playground', label: 'Playground', icon: FlaskConical, permKey: 'playground' as AIPermissionKey },
];

interface Props {
  agentId: string;
}

export default function AgentDetail({ agentId }: Props) {
  const router = useRouter();
  const { agents, isLoading } = useAgents();
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const { company } = useCompanySettings();
  const { role } = useAuth();
  const [activeTab, setActiveTab] = useState('connection');

  const agent = agents.find((a) => a.id === agentId);

  const tabs = useMemo(() => {
    const isSuperAdmin = role === 'super_admin';
    if (isSuperAdmin) return [...fixedTabs, ...restrictedTabs];
    const settings = company?.settings as Record<string, any> | null;
    const aiPerms = settings?.ai_permissions as Record<string, boolean> | undefined;
    if (!aiPerms) return [...fixedTabs, ...restrictedTabs];
    const enabled = restrictedTabs.filter((t) => aiPerms[t.permKey] === true);
    return [...fixedTabs, ...enabled];
  }, [role, company]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.push('/app/agents')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para agentes
        </Button>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Bot className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Agente não encontrado</h2>
          <p className="text-muted-foreground">
            Este agente não existe ou você não tem permissão para acessá-lo.
          </p>
        </div>
      </div>
    );
  }

  const Icon = channelIcon[agent.channel_type] || Smartphone;
  const channelMeta = CHANNEL_REGISTRY[agent.channel_type];
  const status = statusStyles[agent.status || 'disconnected'] || statusStyles.disconnected;

  const renderContent = () => {
    if (!companyId) return null;
    switch (activeTab) {
      case 'connection':
        return <ConnectionTab agent={agent} />;
      case 'prompts':
        return (
          <AIPromptsEditor
            companyId={companyId}
            agentId={agent.id}
            variant="full"
            showConfigInfo={true}
            showVariablesCard={true}
          />
        );
      case 'faq':
        return <FAQManager companyId={companyId} />;
      case 'integrations':
        return <APIKeysSubTab companyId={companyId} agentId={agent.id} />;
      case 'settings':
        return <SettingsSubTab companyId={companyId} agentId={agent.id} />;
      case 'playground':
        return <PlaygroundChat companyId={companyId} agentId={agent.id} />;
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
          onClick={() => router.push('/app/agents')}
          className="mb-4 -ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Agentes
        </Button>

        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="h-7 w-7 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-bold truncate">{agent.display_name}</h1>
              <Badge variant={status.badge} className="shrink-0">
                <span className={cn('h-2 w-2 rounded-full mr-1.5', status.dot)} />
                {status.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {channelMeta?.label}
              {agent.phone_number && (
                <>
                  {' · '}
                  <span className="font-mono">{agent.phone_number}</span>
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

function ConnectionTab({ agent }: { agent: ReturnType<typeof useAgents>['agents'][number] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const channelMeta = CHANNEL_REGISTRY[agent.channel_type];
  const isAvailable = channelMeta?.status === 'available';
  const isTokenMode = channelMeta?.connectionMode === 'token';

  const [qrLoading, setQrLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  const isConnected = agent.status === 'connected';
  const isConnecting = agent.status === 'connecting' && !!agent.qr_code;

  // Polling de status enquanto estiver "connecting" — checa a cada 4s
  useEffect(() => {
    if (agent.status !== 'connecting') return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/agents/${agent.id}/status`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'connected' || data.status === 'disconnected') {
          queryClient.invalidateQueries({ queryKey: ['agents'] });
        }
      } catch {
        /* silencioso — proximo tick tenta de novo */
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [agent.status, agent.id, queryClient]);

  const handleGenerateQr = async () => {
    setQrLoading(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}/qr`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao gerar QR');
      setPairingCode(data.pairing_code || null);
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    } catch (e: any) {
      toast({ title: 'Erro ao gerar QR', description: e.message, variant: 'destructive' });
    } finally {
      setQrLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}/disconnect`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Falha ao desconectar');
      }
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast({ title: 'Agente desconectado' });
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

        {agent.api_url && (
          <div className="text-xs text-muted-foreground space-y-1">
            <div>
              <span className="font-medium">Servidor:</span>{' '}
              <span className="font-mono">{agent.api_url}</span>
            </div>
            <div>
              <span className="font-medium">Instância:</span>{' '}
              <span className="font-mono">{agent.instance_name}</span>
            </div>
          </div>
        )}

        {agent.error_message && agent.status !== 'connected' && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <p className="font-medium">Último erro do provider:</p>
            <p className="text-xs mt-1 break-words">{agent.error_message}</p>
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
            {agent.channel_config &&
              typeof agent.channel_config === 'object' &&
              (agent.channel_config as any)?.channelId && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">Channel UUID: </span>
                  <span className="font-mono">{(agent.channel_config as any).channelId}</span>
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
              {agent.phone_number && (
                <p className="text-sm text-muted-foreground font-mono">{agent.phone_number}</p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Desconectar
            </Button>
          </div>
        ) : isConnecting && agent.qr_code ? (
          <div className="rounded-lg border bg-muted/30 p-6 space-y-4 text-center">
            <div className="border-4 border-foreground rounded-lg p-3 bg-background inline-block">
              <img src={agent.qr_code} alt="QR Code" className="w-64 h-64" />
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
                Gere o QR Code para vincular este agente ao WhatsApp.
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

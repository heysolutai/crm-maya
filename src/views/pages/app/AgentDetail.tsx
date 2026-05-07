import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAgents } from '@/hooks/useAgents';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useAuth } from '@/hooks/useAuth';
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
            variant="full"
            showConfigInfo={true}
            showVariablesCard={true}
          />
        );
      case 'faq':
        return <FAQManager companyId={companyId} />;
      case 'integrations':
        return <APIKeysSubTab companyId={companyId} />;
      case 'settings':
        return <SettingsSubTab companyId={companyId} />;
      case 'playground':
        return <PlaygroundChat companyId={companyId} />;
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
  const channelMeta = CHANNEL_REGISTRY[agent.channel_type];
  const isAvailable = channelMeta?.status === 'available';

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Conexão do canal</h3>
          <p className="text-sm text-muted-foreground">{channelMeta?.description}</p>
        </div>

        {!isAvailable ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Plug className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
            <p className="font-medium">Canal em desenvolvimento</p>
            <p className="text-sm text-muted-foreground mt-1">
              O adapter para <strong>{channelMeta?.label}</strong> ainda não foi implementado.
              Aguardando documentação da API.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border bg-muted/30 p-6 text-center">
            <Smartphone className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium mb-1">Conectar este agente</p>
            <p className="text-sm text-muted-foreground mb-4">
              O fluxo de conexão será habilitado em seguida (QR Code para UazAPI).
            </p>
            <p className="text-xs text-muted-foreground italic">
              Em Fase 1: estrutura criada. Conexão entrega na Fase 2.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

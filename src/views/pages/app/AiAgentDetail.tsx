import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAiAgents } from '@/hooks/useAiAgents';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Bot,
  Loader2,
  MessageSquareText,
  BookOpen,
  Key,
  Settings as SettingsIcon,
  FlaskConical,
} from 'lucide-react';
import { AIPromptsEditor } from '@/components/ai';
import { FAQManager } from '@/components/settings/FAQManager';
import { SettingsSubTab } from '@/components/super-admin/company-details/ai-config/SettingsSubTab';
import { APIKeysSubTab } from '@/components/super-admin/company-details/ai-config/APIKeysSubTab';
import { PlaygroundChat } from '@/components/ai/PlaygroundChat';
import { cn } from '@/lib/utils';
import type { AIPermissionKey } from '@/components/super-admin/company-details/AIPermissionsConfig';

const fixedTabs = [
  { id: 'prompts', label: 'Prompts', icon: MessageSquareText, permKey: 'prompts' as AIPermissionKey },
  { id: 'faq', label: 'FAQ', icon: BookOpen, permKey: 'faq' as AIPermissionKey },
];

const restrictedTabs = [
  { id: 'integrations', label: 'Integrações', icon: Key, permKey: 'integrations' as AIPermissionKey },
  { id: 'settings', label: 'Ajustes', icon: SettingsIcon, permKey: 'settings' as AIPermissionKey },
  { id: 'playground', label: 'Playground', icon: FlaskConical, permKey: 'playground' as AIPermissionKey },
];

interface Props {
  aiAgentId: string;
}

export default function AiAgentDetail({ aiAgentId }: Props) {
  const router = useRouter();
  const { aiAgents, isLoading } = useAiAgents();
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const { company } = useCompanySettings();
  const { role } = useAuth();
  const [activeTab, setActiveTab] = useState('prompts');

  const aiAgent = aiAgents.find((a) => a.id === aiAgentId);

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

  if (!aiAgent) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.push('/app/ai-agents')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para agentes IA
        </Button>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Bot className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Agente IA não encontrado</h2>
          <p className="text-muted-foreground">
            Este agente IA não existe ou você não tem permissão para acessá-lo.
          </p>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    if (!companyId) return null;
    switch (activeTab) {
      case 'prompts':
        return (
          <AIPromptsEditor
            companyId={companyId}
            agentId={aiAgent.id}
            variant="full"
            showConfigInfo={true}
            showVariablesCard={true}
          />
        );
      case 'faq':
        return <FAQManager companyId={companyId} />;
      case 'integrations':
        return <APIKeysSubTab companyId={companyId} agentId={aiAgent.id} />;
      case 'settings':
        return <SettingsSubTab companyId={companyId} agentId={aiAgent.id} />;
      case 'playground':
        return <PlaygroundChat companyId={companyId} agentId={aiAgent.id} />;
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
          onClick={() => router.push('/app/ai-agents')}
          className="mb-4 -ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Agentes IA
        </Button>

        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Bot className="h-7 w-7 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold truncate">{aiAgent.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {aiAgent.is_active ? 'Ativo' : 'Inativo'}
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

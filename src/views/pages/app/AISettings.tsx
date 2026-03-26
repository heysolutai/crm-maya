import { useState, useMemo } from 'react';
import { Bot, Loader2, MessageSquareText, Zap, Link2, BookOpen, Key, Settings, FlaskConical } from 'lucide-react';
import { AIPromptsEditor } from '@/components/ai';
import { FollowUpsSubTab } from '@/components/super-admin/company-details/ai-config/FollowUpsSubTab';
import { SettingsSubTab } from '@/components/super-admin/company-details/ai-config/SettingsSubTab';
import { APIKeysSubTab } from '@/components/super-admin/company-details/ai-config/APIKeysSubTab';
import { FAQManager } from '@/components/settings/FAQManager';
import { ApiKeysTab } from '@/components/super-admin/company-details/ApiKeysTab';
import { PlaygroundChat } from '@/components/ai/PlaygroundChat';
import { WhatsAppConfigCard } from '@/components/super-admin/company-details/WhatsAppConfigCard';
import { GoogleCalendarConfig } from '@/components/settings/GoogleCalendarConfig';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import type { AIPermissionKey } from '@/components/super-admin/company-details/AIPermissionsConfig';

// These tabs are always visible for clients
const fixedMenuItems = [
  { id: 'prompts', label: 'Prompts', icon: MessageSquareText, permKey: 'prompts' as AIPermissionKey },
  { id: 'follow-ups', label: 'Automações', icon: Zap, permKey: 'follow_ups' as AIPermissionKey },
  { id: 'conexoes', label: 'Conexões', icon: Link2, permKey: 'connections' as AIPermissionKey },
  { id: 'faq', label: 'FAQ', icon: BookOpen, permKey: 'faq' as AIPermissionKey },
];

// These tabs only appear if enabled by super admin
const restrictedMenuItems = [
  { id: 'integrations', label: 'Integrações', icon: Key, permKey: 'integrations' as AIPermissionKey },
  { id: 'api-keys', label: 'API Keys', icon: Key, permKey: 'api_keys' as AIPermissionKey },
  { id: 'settings', label: 'Ajustes', icon: Settings, permKey: 'settings' as AIPermissionKey },
  { id: 'playground', label: 'Playground', icon: FlaskConical, permKey: 'playground' as AIPermissionKey },
];

export default function AppAISettings() {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const { company, isLoading: isLoadingCompany } = useCompanySettings();
  const { role } = useAuth();
  const [activeTab, setActiveTab] = useState('');

  const isSuperAdmin = role === 'super_admin';

  const menuItems = useMemo(() => {
    const allItems = [...fixedMenuItems, ...restrictedMenuItems];
    if (isSuperAdmin) return allItems;
    const settings = company?.settings as Record<string, any> | null;
    const aiPerms = settings?.ai_permissions as Record<string, boolean> | undefined;
    if (!aiPerms) {
      // No permissions configured = show fixed tabs + all restricted (backward compat for admins)
      return allItems;
    }
    // Fixed tabs always show; restricted tabs only if explicitly enabled
    const enabledRestricted = restrictedMenuItems.filter((item) => aiPerms[item.permKey] === true);
    return [...fixedMenuItems, ...enabledRestricted];
  }, [company, isSuperAdmin]);

  // Set initial active tab when menu items are available
  if (activeTab === '' && menuItems.length > 0) {
    setActiveTab(menuItems[0].id);
  }

  if (!companyId || isLoadingCompany) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (menuItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Bot className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Sem acesso às configurações de IA</h2>
        <p className="text-muted-foreground max-w-md">
          Nenhuma permissão de IA foi habilitada para sua empresa. Entre em contato com o suporte para solicitar acesso.
        </p>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'prompts':
        return (
          <AIPromptsEditor
            companyId={companyId}
            variant="full"
            showConfigInfo={true}
            showVariablesCard={true}
          />
        );
      case 'follow-ups':
        return <FollowUpsSubTab companyId={companyId} />;
      case 'conexoes':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold">🔗 Conexões</h3>
              <p className="text-sm text-muted-foreground">
                Conecte o WhatsApp e o Google Calendar à sua empresa
              </p>
            </div>
            <WhatsAppConfigCard companyId={companyId} />
            <GoogleCalendarConfig />
          </div>
        );
      case 'faq':
        return <FAQManager companyId={companyId} />;
      case 'integrations':
        return <APIKeysSubTab companyId={companyId} />;
      case 'api-keys':
        return <ApiKeysTab companyId={companyId} />;
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
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Bot className="h-7 w-7" />
          Configurações de IA
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure prompts, follow-ups, conexões e comportamento da IA
        </p>
      </div>

      {/* Mobile: horizontal scrollable menu */}
      <div className="md:hidden">
        <div className="overflow-x-auto -mx-4 px-4 pb-3">
          <div className="flex gap-2 w-max">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap border',
                  activeTab === item.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:bg-muted'
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">{renderContent()}</div>
      </div>

      {/* Desktop: sidebar + content */}
      <div className="hidden md:flex gap-6">
        <nav className="w-56 shrink-0 space-y-1">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left',
                activeTab === item.id
                  ? 'bg-primary/10 text-primary border-l-2 border-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="flex-1 min-w-0">{renderContent()}</div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Building2, Bot, Users, Shield, Lock, Settings, AlertTriangle } from 'lucide-react';
import { useCompanyDetails } from '@/hooks/useCompanyDetails';
import { BasicInfoTab } from '@/components/super-admin/company-details/BasicInfoTab';
import { SettingsTab } from '@/components/super-admin/company-details/SettingsTab';
import { TeamTab } from '@/components/super-admin/company-details/TeamTab';
import { RolePermissionsConfig } from '@/components/settings/RolePermissionsConfig';
import { AIPermissionsConfig } from '@/components/super-admin/company-details/AIPermissionsConfig';
import { cn } from '@/lib/utils';

const sections = [
  { key: 'basic', label: 'Dados Básicos', icon: Building2 },
  { key: 'ai', label: 'Configurações de IA', icon: Bot },
  { key: 'team', label: 'Equipe', icon: Users },
  { key: 'permissions', label: 'Permissões de Usuários', icon: Shield },
  { key: 'ai-permissions', label: 'Permissões de IA', icon: Lock },
  { key: 'settings', label: 'Configurações', icon: Settings },
] as const;

type SectionKey = typeof sections[number]['key'];

export default function CompanyDetails() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultTab = (searchParams.get('tab') || 'basic') as SectionKey;
  const [activeSection, setActiveSection] = useState<SectionKey>(defaultTab);
  const { company, users, isLoading, isLoadingUsers, error } = useCompanyDetails(id);

  const isSetupIncomplete = company && (company.settings as any)?.setup_completed !== true;

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando empresa...</p>
        </div>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Empresa não encontrada</h2>
          <p className="text-muted-foreground mb-4">
            A empresa que você está procurando não existe ou foi removida
          </p>
          <Button onClick={() => router.push('/super-admin/companies')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para Empresas
          </Button>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeSection) {
      case 'basic':
        return <BasicInfoTab company={company} />;
      case 'ai':
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <Bot className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">Configurações de IA</h3>
            <p className="text-muted-foreground mb-6 text-center max-w-md">
              Configure prompts, follow-ups, API keys, setup e comportamento da IA
            </p>
            <Button
              size="lg"
              onClick={() => router.push(`/super-admin/companies/${company.id}/ai-settings`)}
            >
              Acessar Configurações de IA
            </Button>
          </div>
        );
      case 'team':
        return <TeamTab companyId={id!} />;
      case 'permissions':
        return <RolePermissionsConfig companyId={id} />;
      case 'ai-permissions':
        return <AIPermissionsConfig companyId={id!} />;
      case 'settings':
        return <SettingsTab company={company} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/super-admin/companies')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              {company.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Gerencie todos os aspectos desta empresa
            </p>
          </div>
        </div>
        {company.subscription_status && (
          <Badge variant={company.subscription_status === 'active' ? 'default' : 'secondary'}>
            {company.subscription_status === 'active' ? 'Ativo' : company.subscription_status === 'trial' ? 'Trial' : company.subscription_status}
          </Badge>
        )}
      </div>

      {/* Setup warning banner */}
      {isSetupIncomplete && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4">
          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              O setup desta empresa não foi concluído.
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              Complete o setup nas Configurações de IA.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-yellow-500/50 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-500/20"
            onClick={() => router.push(`/super-admin/companies/${company.id}/ai-settings`)}
          >
            Completar Setup
          </Button>
        </div>
      )}

      {/* Mobile: horizontal tabs */}
      <div className="md:hidden">
        <div className="overflow-x-auto -mx-4 px-4 pb-3">
          <div className="flex gap-2 w-max">
            {sections.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.key;
              return (
                <button
                  key={section.key}
                  onClick={() => setActiveSection(section.key)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap border',
                    isActive
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {section.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-4">{renderContent()}</div>
      </div>

      {/* Desktop: Sidebar + Content layout */}
      <div className="hidden md:flex gap-6 min-h-[calc(100vh-14rem)]">
        {/* Sidebar */}
        <nav className="w-56 shrink-0 space-y-1">
          {sections.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.key;
            return (
              <button
                key={section.key}
                onClick={() => setActiveSection(section.key)}
                className={cn(
                  'flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {section.label}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

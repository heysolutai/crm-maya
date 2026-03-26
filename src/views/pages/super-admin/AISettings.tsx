import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ArrowLeft, Bot, Sparkles, AlertTriangle, CheckCircle2, XCircle, AlertCircle, ChevronsUpDown, Check } from 'lucide-react';
import { useCompanyDetails } from '@/hooks/useCompanyDetails';
import { useCompanies } from '@/hooks/useCompanies';
import { useSetupChecklist } from '@/hooks/useSetupChecklist';
import { UnsavedChangesProvider, useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { PromptsSubTab } from '@/components/super-admin/company-details/ai-config/PromptsSubTab';
import { FollowUpsSubTab } from '@/components/super-admin/company-details/ai-config/FollowUpsSubTab';
import { APIKeysSubTab } from '@/components/super-admin/company-details/ai-config/APIKeysSubTab';
import { IntegrationsSubTab } from '@/components/super-admin/company-details/ai-config/IntegrationsSubTab';
import { SettingsSubTab } from '@/components/super-admin/company-details/ai-config/SettingsSubTab';
import { AIBuilderChatDialog } from '@/components/super-admin/company-details/ai-config/AIBuilderChatDialog';
import { FAQManager } from '@/components/settings/FAQManager';
import { ApiKeysTab } from '@/components/super-admin/company-details/ApiKeysTab';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

function StatusIcon({ status }: { status: 'red' | 'yellow' | 'green' }) {
  if (status === 'green') return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />;
  if (status === 'yellow') return <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0" />;
  return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
}

function AISettingsContent() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [completingSetup, setCompletingSetup] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('prompts');
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const { company, isLoading } = useCompanyDetails(id);
  const { companies } = useCompanies();
  const { items, completedCount, totalCount } = useSetupChecklist(id);
  const { toast } = useToast();
  const { isDirty, confirmIfDirty, showDialog, handleConfirm, handleCancel } = useUnsavedChanges();

  const handleCompanySwitch = (companyId: string) => {
    if (companyId === id) return;
    confirmIfDirty(() => {
      setComboboxOpen(false);
      router.replace(`/super-admin/companies/${companyId}/ai-settings`);
    });
  };

  // Browser beforeunload warning
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleCompleteSetup = async () => {
    if (!id || !company) return;
    setCompletingSetup(true);
    try {
      const currentSettings = (company.settings as Record<string, any>) || {};
      const { error } = await supabase
        .from('companies')
        .update({ settings: { ...currentSettings, setup_completed: true } })
        .eq('id', id);
      if (error) throw error;
      toast({ title: 'Setup marcado como concluído!' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setCompletingSetup(false);
    }
  };

  const handleTabChange = (newTab: string) => {
    if (newTab === activeTab) return;
    confirmIfDirty(() => setActiveTab(newTab));
  };

  const handleGoBack = () => {
    confirmIfDirty(() => router.push(`/super-admin/companies/${id}`));
  };

  const getBannerStyle = () => {
    if (completedCount === totalCount) return 'border-emerald-500/50 bg-emerald-500/10';
    if (completedCount >= 13) return 'border-yellow-500/50 bg-yellow-500/10';
    return 'border-red-500/50 bg-red-500/10';
  };

  const getBannerIcon = () => {
    if (completedCount === totalCount) return <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />;
    if (completedCount >= 13) return <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />;
    return <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />;
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando configurações...</p>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Empresa não encontrada</h2>
          <Button onClick={() => router.push('/super-admin/companies')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para Empresas
          </Button>
        </div>
      </div>
    );
  }

  const redItems = items.filter(i => i.category === 'red');
  const yellowItems = items.filter(i => i.category === 'yellow');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleGoBack}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bot className="h-8 w-8" />
            Configurações de IA
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure prompts, follow-ups, API keys e comportamento da IA
          </p>
        </div>
        <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={comboboxOpen}
              className="w-72 justify-between font-medium"
            >
              {company?.name || 'Selecionar empresa...'}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0 z-50" align="end">
            <Command>
              <CommandInput placeholder="Buscar empresa..." />
              <CommandList>
                <CommandEmpty>Nenhuma empresa encontrada.</CommandEmpty>
                <CommandGroup>
                  {companies?.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={c.name}
                      onSelect={() => handleCompanySwitch(c.id)}
                    >
                      <Check className={cn("mr-2 h-4 w-4", c.id === id ? "opacity-100" : "opacity-0")} />
                      {c.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Setup checklist banner */}
      <Collapsible open={checklistOpen} onOpenChange={setChecklistOpen}>
        <div className={`rounded-lg border p-4 ${getBannerStyle()}`}>
          <CollapsibleTrigger className="w-full">
            <div className="flex items-center gap-3">
              {getBannerIcon()}
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">
                    Setup: {completedCount}/{totalCount} configurações
                  </p>
                  <span className="text-xs text-muted-foreground">
                    ({progressPercent}%)
                  </span>
                </div>
                <Progress value={progressPercent} className="h-2 mt-2" />
              </div>
              {completedCount === totalCount ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-emerald-500/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
                  onClick={(e) => { e.stopPropagation(); handleCompleteSetup(); }}
                  disabled={completingSetup}
                >
                  {completingSetup ? 'Concluindo...' : '✅ Marcar como Concluído'}
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">Clique para ver detalhes</span>
              )}
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1.5 uppercase tracking-wider">
                  Obrigatórios
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                  {redItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-1.5 text-xs py-1 px-2 rounded bg-background/50">
                      <StatusIcon status={item.status} />
                      <span className={item.status === 'green' ? 'text-muted-foreground' : 'font-medium'}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-yellow-600 dark:text-yellow-400 mb-1.5 uppercase tracking-wider">
                  Recomendados
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                  {yellowItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-1.5 text-xs py-1 px-2 rounded bg-background/50">
                      <StatusIcon status={item.status} />
                      <span className={item.status === 'green' ? 'text-muted-foreground' : 'font-medium'}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="prompts">📝 Prompts</TabsTrigger>
          <TabsTrigger value="follow-ups">⚡ Automações</TabsTrigger>
          <TabsTrigger value="integrations">🔗 Integrações</TabsTrigger>
          <TabsTrigger value="api">🔑 API Keys - Serviços</TabsTrigger>
          <TabsTrigger value="api-keys">🔐 API Key - Sistema</TabsTrigger>
          <TabsTrigger value="faq">📚 FAQ</TabsTrigger>
          <TabsTrigger value="settings">⚙️ Ajustes de IA</TabsTrigger>
        </TabsList>

        <TabsContent value="prompts" forceMount={activeTab === 'prompts' ? undefined : undefined}>
          {activeTab === 'prompts' && <PromptsSubTab companyId={id!} />}
        </TabsContent>

        <TabsContent value="follow-ups">
          {activeTab === 'follow-ups' && <FollowUpsSubTab companyId={id!} />}
        </TabsContent>

        <TabsContent value="integrations">
          {activeTab === 'integrations' && <IntegrationsSubTab companyId={id!} />}
        </TabsContent>

        <TabsContent value="api">
          {activeTab === 'api' && <APIKeysSubTab companyId={id!} />}
        </TabsContent>

        <TabsContent value="api-keys">
          {activeTab === 'api-keys' && <ApiKeysTab companyId={id!} />}
        </TabsContent>

        <TabsContent value="faq">
          {activeTab === 'faq' && <FAQManager companyId={id!} />}
        </TabsContent>

        <TabsContent value="settings">
          {activeTab === 'settings' && <SettingsSubTab companyId={id!} />}
        </TabsContent>
      </Tabs>

      {/* Floating AI Builder Button */}
      <Button
        onClick={() => setBuilderOpen(true)}
        size="lg"
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all z-50 p-0"
      >
        <Sparkles className="h-6 w-6" />
      </Button>

      <AIBuilderChatDialog open={builderOpen} onOpenChange={setBuilderOpen} companyId={id!} />

      {/* Unsaved changes confirmation dialog */}
      <AlertDialog open={showDialog} onOpenChange={(open) => { if (!open) handleCancel(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterações não salvas</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem alterações que ainda não foram salvas. Se continuar, essas alterações serão descartadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>Voltar e salvar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Descartar alterações
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AISettings() {
  return (
    <UnsavedChangesProvider>
      <AISettingsContent />
    </UnsavedChangesProvider>
  );
}

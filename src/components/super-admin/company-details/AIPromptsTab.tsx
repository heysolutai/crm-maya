import { Bot } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PromptsSubTab } from './ai-config/PromptsSubTab';
import { FollowUpsSubTab } from './ai-config/FollowUpsSubTab';
import { APIKeysSubTab } from './ai-config/APIKeysSubTab';
import { SettingsSubTab } from './ai-config/SettingsSubTab';
import { FAQManager } from '@/components/settings/FAQManager';
import { ApiKeysTab } from './ApiKeysTab';

interface AIPromptsTabProps {
  companyId: string;
}

export function AIPromptsTab({ companyId }: AIPromptsTabProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Bot className="h-6 w-6" />
          Configurações de IA
        </h2>
        <p className="text-muted-foreground mt-1">
          Configure prompts, follow-ups, API keys e comportamento
        </p>
      </div>

      <Tabs defaultValue="prompts" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="prompts">📝 Prompts</TabsTrigger>
          <TabsTrigger value="follow-ups">⚡ Automações</TabsTrigger>
          <TabsTrigger value="integrations">🔗 Integrações</TabsTrigger>
          <TabsTrigger value="faq">📚 FAQ</TabsTrigger>
          <TabsTrigger value="api-keys">🔑 API Keys</TabsTrigger>
          <TabsTrigger value="settings">⚙️ Ajustes de IA</TabsTrigger>
        </TabsList>

        <TabsContent value="prompts">
          <PromptsSubTab companyId={companyId} />
        </TabsContent>

        <TabsContent value="follow-ups">
          <FollowUpsSubTab companyId={companyId} />
        </TabsContent>

        <TabsContent value="integrations">
          <APIKeysSubTab companyId={companyId} />
        </TabsContent>

        <TabsContent value="faq">
          <FAQManager companyId={companyId} />
        </TabsContent>

        <TabsContent value="api-keys">
          <ApiKeysTab companyId={companyId} />
        </TabsContent>

        <TabsContent value="settings">
          <SettingsSubTab companyId={companyId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

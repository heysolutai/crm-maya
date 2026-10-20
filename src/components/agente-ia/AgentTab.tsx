'use client';

import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { Key, MessageSquareText, SlidersHorizontal, Wrench } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SimpleAgentConfig } from '@/components/ai/SimpleAgentConfig';
import { APIKeysSubTab } from '@/components/super-admin/company-details/ai-config/APIKeysSubTab';
import { SituacaoCard } from '@/components/situacao/SituacaoCard';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { BehaviorTab } from './BehaviorTab';
import { IaLigadaCard } from './IaLigadaCard';
import { ToolsTab } from './ToolsTab';

type SubTabId = 'prompt' | 'tools' | 'behavior' | 'providers';

interface SubTab {
  id: SubTabId;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

interface Props {
  /** Conexão (WhatsApp) aberta. */
  inboxId: string;
  companyId: string;
  /** Agente de IA desta conexão. */
  agentId: string;
  isSuperAdmin: boolean;
  /** "Provedores": só com a permissão de integrações (ou super-admin). */
  canProviders: boolean;
  /** "Configurações técnicas" do Comportamento: permissão de ajustes (ou super-admin). */
  canTechnical: boolean;
}

/**
 * Aba "Agente de IA" de uma conexão: Prompt · Ferramentas · Comportamento ·
 * Provedores. Os painéis já abertos continuam montados (só escondidos) para
 * que o que a pessoa digitou não se perca ao trocar de sub-aba.
 */
export function AgentTab({ inboxId, companyId, agentId, isSuperAdmin, canProviders, canTechnical }: Props) {
  const { setDirty } = useUnsavedChanges();

  const subTabs: SubTab[] = [
    { id: 'prompt', label: 'Prompt', icon: MessageSquareText },
    { id: 'tools', label: 'Ferramentas', icon: Wrench },
    { id: 'behavior', label: 'Comportamento', icon: SlidersHorizontal },
    ...(canProviders ? [{ id: 'providers' as const, label: 'Provedores', icon: Key }] : []),
  ];

  const [ativa, setAtiva] = useState<SubTabId>('prompt');
  const [abertas, setAbertas] = useState<ReadonlySet<SubTabId>>(() => new Set<SubTabId>(['prompt']));

  const trocar = (valor: string) => {
    const id = subTabs.find((t) => t.id === valor)?.id;
    if (!id) return;
    setAtiva(id);
    setAbertas((atual) => (atual.has(id) ? atual : new Set([...atual, id])));
  };

  // Aviso de "alterações não salvas": junta os formulários desta aba num só
  // sinal e só liga/desliga o aviso global quando o conjunto muda de estado.
  const sujos = useRef<Record<string, boolean>>({});
  const avisarAlteracao = useCallback(
    (chave: string, sujo: boolean) => {
      const antes = Object.values(sujos.current).some(Boolean);
      sujos.current[chave] = sujo;
      const depois = Object.values(sujos.current).some(Boolean);
      if (antes !== depois) setDirty(depois);
    },
    [setDirty]
  );
  const avisarPrompt = useCallback((sujo: boolean) => avisarAlteracao('prompt', sujo), [avisarAlteracao]);
  const avisarComportamento = useCallback((sujo: boolean) => avisarAlteracao('behavior', sujo), [avisarAlteracao]);

  useEffect(() => {
    const registro = sujos.current;
    return () => {
      // Saiu da aba: não deixa o aviso preso por causa de um formulário que sumiu.
      if (Object.values(registro).some(Boolean)) setDirty(false);
    };
  }, [setDirty]);

  return (
    <div className="space-y-4">
      {/* Liga/desliga geral da IA neste WhatsApp */}
      <IaLigadaCard companyId={companyId} agentId={agentId} />

      {/* Situação deste WhatsApp: o que impede a IA de atender (ou "Tudo funcionando") */}
      <SituacaoCard inboxId={inboxId} />

      <Tabs value={ativa} onValueChange={trocar} className="space-y-4">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto p-1">
          {subTabs.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="shrink-0 gap-2 px-3 py-2 sm:px-4">
              <t.icon className="h-4 w-4 shrink-0" />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {subTabs.map((t) => (
          <TabsContent key={t.id} value={t.id} forceMount className="mt-0 data-[state=inactive]:hidden">
            {abertas.has(t.id) && (
              <>
                {t.id === 'prompt' && (
                  <SimpleAgentConfig
                    companyId={companyId}
                    agentId={agentId}
                    onDirtyChange={avisarPrompt}
                  />
                )}
                {t.id === 'tools' && <ToolsTab inboxId={inboxId} agentId={agentId} />}
                {t.id === 'behavior' && (
                  <BehaviorTab
                    companyId={companyId}
                    agentId={agentId}
                    showTechnical={canTechnical}
                    onDirtyChange={avisarComportamento}
                  />
                )}
                {t.id === 'providers' && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Chaves e modelo de IA. Normalmente só o suporte mexe aqui.
                    </p>
                    <APIKeysSubTab companyId={companyId} agentId={agentId} />
                  </div>
                )}
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

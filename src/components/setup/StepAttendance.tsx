"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Bot, Link2, Loader2, Plus, Webhook } from 'lucide-react';
import { useAIConfigurations } from '@/hooks/useAIConfigurations';
import { SimpleAgentConfig } from '@/components/ai/SimpleAgentConfig';
import { FAQManager } from '@/components/settings/FAQManager';
import { isHttpUrl, sendJson, withCompany, type SetupStepHandle } from './setup-api';
import type { SetupStatus } from './setup-status';

interface Props {
  companyId: string;
  companyName: string;
  status: SetupStatus | null;
  onRefresh: () => void;
}

/**
 * Passo "IA Atendimento": o minimo pra IA entrar no ar.
 *  - qual agente atende cada conexao (Inbox.aiAgentId)
 *  - webhook do n8n (vazio = global do sistema)
 *  - prompt no modo simples (SimpleAgentConfig, com botao de salvar proprio)
 *  - FAQ / base de conhecimento (FAQManager, tambem salva sozinho)
 *
 * O "Salvar e continuar" grava o webhook; prompt e FAQ salvam nos proprios cards.
 */
export const StepAttendance = forwardRef<SetupStepHandle, Props>(function StepAttendance(
  { companyId, companyName, status, onRefresh },
  ref
) {
  const queryClient = useQueryClient();
  const activeInboxes = useMemo(() => (status?.inboxes ?? []).filter((i) => i.isActive), [status]);
  const agents = status?.agents ?? [];

  const [selectedInboxId, setSelectedInboxId] = useState<string>('');
  const [linkAgentId, setLinkAgentId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [webhookDraft, setWebhookDraft] = useState<string | null>(null);

  // Mantem uma conexao valida selecionada quando a lista muda.
  useEffect(() => {
    if (activeInboxes.length === 0) {
      if (selectedInboxId) setSelectedInboxId('');
      return;
    }
    if (!activeInboxes.some((i) => i.id === selectedInboxId)) {
      setSelectedInboxId(activeInboxes[0].id);
    }
  }, [activeInboxes, selectedInboxId]);

  const selectedInbox = activeInboxes.find((i) => i.id === selectedInboxId) ?? null;

  // Sem conexao, o webhook do WhatsApp cai no primeiro agente ativo do restaurante.
  const agentId = selectedInbox
    ? selectedInbox.aiAgentId ?? undefined
    : agents.find((a) => a.isActive)?.id;
  const agent = agents.find((a) => a.id === agentId) ?? null;

  const { configurations, isLoading: loadingConfig } = useAIConfigurations(
    agentId ? { companyId, agentId } : undefined
  );
  const config = configurations?.find((c) => c.id === agentId) ?? null;
  const savedWebhook = config?.n8n_webhook_url ?? '';
  const webhookValue = webhookDraft ?? savedWebhook;

  // Troca de agente descarta o rascunho do webhook do agente anterior.
  useEffect(() => {
    setWebhookDraft(null);
    setLinkAgentId('');
  }, [agentId]);

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['setup-checklist', companyId] }),
      queryClient.invalidateQueries({ queryKey: ['ai-configurations'] }),
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances', companyId] }),
      queryClient.invalidateQueries({ queryKey: ['inboxes'] }),
    ]);
    onRefresh();
  };

  const handleCreateAgent = async () => {
    setBusy(true);
    try {
      await sendJson(
        withCompany('/api/ai-configurations', companyId),
        'POST',
        {
          name: selectedInbox?.name || companyName,
          prompts: {},
          is_active: true,
          ...(selectedInbox ? { whatsapp_instance_id: selectedInbox.id } : {}),
        },
        'Erro ao criar o agente de IA'
      );
      await refreshAll();
      toast.success('Agente de IA criado e vinculado');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Agente inativo e ignorado pelo webhook do WhatsApp (cai em outro agente ou
  // so no webhook global, sem base de conhecimento).
  const handleActivateAgent = async () => {
    if (!agentId) return;
    setBusy(true);
    try {
      await sendJson(
        withCompany('/api/ai-configurations', companyId),
        'PUT',
        { id: agentId, is_active: true },
        'Erro ao ativar o agente'
      );
      await refreshAll();
      toast.success('Agente ativado');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleLinkAgent = async () => {
    if (!selectedInbox || !linkAgentId) return;
    setBusy(true);
    try {
      await sendJson(
        withCompany('/api/agents', companyId),
        'PUT',
        { id: selectedInbox.id, aiAgentId: linkAgentId },
        'Erro ao vincular o agente'
      );
      await refreshAll();
      toast.success('Agente vinculado à conexão');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      save: async () => {
        if (!agentId || webhookDraft === null || webhookDraft.trim() === savedWebhook.trim()) return true;
        const url = webhookDraft.trim();
        if (!isHttpUrl(url)) {
          toast.error('URL do webhook inválida', { description: 'Use um endereço http(s) completo.' });
          return false;
        }
        try {
          await sendJson(
            withCompany('/api/ai-configurations', companyId),
            'PUT',
            { id: agentId, n8n_webhook_url: url || null },
            'Erro ao salvar o webhook'
          );
          setWebhookDraft(null);
          await refreshAll();
          toast.success('Webhook da IA salvo');
          return true;
        } catch (e) {
          toast.error((e as Error).message);
          return false;
        }
      },
    })
  );

  const otherAgents = agents.filter((a) => a.id !== agentId);

  return (
    <div className="space-y-6">
      {/* Conexao + agente */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-primary" />
            Agente de IA
          </CardTitle>
          <CardDescription>Cada conexão de WhatsApp tem o seu agente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeInboxes.length === 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Nenhuma conexão de WhatsApp ativa. Volte ao passo &quot;Canal WhatsApp&quot; para criar uma;
                até lá, a configuração abaixo vale para o agente principal do restaurante.
              </AlertDescription>
            </Alert>
          )}

          {activeInboxes.length > 1 && (
            <div className="space-y-2">
              <Label>Conexão</Label>
              <Select value={selectedInboxId} onValueChange={setSelectedInboxId}>
                <SelectTrigger className="w-full sm:w-80">
                  <SelectValue placeholder="Escolha a conexão" />
                </SelectTrigger>
                <SelectContent>
                  {activeInboxes.map((inbox) => (
                    <SelectItem key={inbox.id} value={inbox.id}>
                      {inbox.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {agent ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
              <span className="text-sm text-muted-foreground">
                {selectedInbox ? `${selectedInbox.name} é atendida por` : 'Agente principal:'}
              </span>
              <span className="font-medium">{agent.name || 'Agente sem nome'}</span>
              <Badge variant={agent.isActive ? 'default' : 'secondary'} className="text-[10px]">
                {agent.isActive ? 'Ativo' : 'Inativo'}
              </Badge>
              <Badge variant={agent.hasPrompt ? 'outline' : 'destructive'} className="text-[10px]">
                {agent.hasPrompt ? 'Com prompt' : 'Sem prompt'}
              </Badge>
              {!agent.isActive && (
                <Button variant="outline" size="sm" className="ml-auto" onClick={handleActivateAgent} disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Ativar agente
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-dashed p-3">
              <p className="text-sm text-muted-foreground">
                {selectedInbox
                  ? `${selectedInbox.name} ainda não tem agente de IA.`
                  : 'O restaurante ainda não tem agente de IA.'}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button onClick={handleCreateAgent} disabled={busy} size="sm">
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  Criar agente
                </Button>
                {selectedInbox && otherAgents.length > 0 && (
                  <div className="flex flex-1 gap-2">
                    <Select value={linkAgentId} onValueChange={setLinkAgentId}>
                      <SelectTrigger className="h-9 flex-1">
                        <SelectValue placeholder="Ou vincular um existente" />
                      </SelectTrigger>
                      <SelectContent>
                        {otherAgents.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name || 'Agente sem nome'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={handleLinkAgent} disabled={busy || !linkAgentId}>
                      <Link2 className="h-4 w-4 mr-2" />
                      Vincular
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {agentId && (
        <>
          {/* Webhook */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Webhook className="h-4 w-4 text-primary" />
                Webhook da IA (n8n)
              </CardTitle>
              <CardDescription>
                Para onde as mensagens dos clientes vão para a IA responder.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label htmlFor="setup-n8n-webhook">URL do webhook</Label>
              <Input
                id="setup-n8n-webhook"
                type="url"
                value={webhookValue}
                onChange={(e) => setWebhookDraft(e.target.value)}
                disabled={loadingConfig}
                placeholder={
                  status?.globalWebhookConfigured
                    ? 'Vazio = usa o webhook global do sistema'
                    : 'https://seu-n8n.com/webhook/...'
                }
              />
              {status?.globalWebhookConfigured ? (
                <p className="text-xs text-muted-foreground">
                  Deixe em branco para usar o webhook global (Configurações do sistema). Preencha só se este
                  restaurante usa um fluxo próprio.
                </p>
              ) : (
                <p className="text-xs text-destructive">
                  Não há webhook global configurado: sem uma URL aqui a IA não recebe as mensagens.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Prompt (modo simples) */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              O prompt é salvo pelo botão &quot;Salvar configuração&quot; do próprio card.
            </p>
            <SimpleAgentConfig key={agentId} companyId={companyId} agentId={agentId} />
          </div>
        </>
      )}

      {/* FAQ / base de conhecimento */}
      <FAQManager companyId={companyId} />
    </div>
  );
});

'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Check, ExternalLink, Loader2, Plug, ShieldCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { AbilityRow, AmberHint } from './AbilityRow';
import type { IntegrationLastTest, IntegrationOrigin, IntegrationProblem, IntegrationState } from './types';
import { useSaveIntegration, useSaveRestaurantId, useTestIntegration } from './useIntegrations';

/** O WhatsApp (conexão) em que a pessoa está: o ID do restaurante é dele. */
export interface InboxRef {
  id: string;
  /** ID do restaurante salvo neste WhatsApp (null = ainda não preenchido). */
  restaurantId: string | null;
}

interface Props {
  integration: IntegrationState;
  inbox: InboxRef;
  canEdit: boolean;
}

function formatarData(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function ResultadoTeste({ teste }: { teste: IntegrationLastTest | null }) {
  if (!teste) return null;
  if (teste.ok) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>
          Está funcionando <span className="text-muted-foreground">· testado em {formatarData(teste.at)}</span>
        </span>
      </p>
    );
  }
  return (
    <div className="space-y-1.5 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
      <p className="flex items-start gap-1.5">
        <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{teste.error || 'O último teste não deu certo.'}</span>
      </p>
      {/* Só o super-admin recebe: o erro técnico, pra corrigir sem ir no banco. */}
      {teste.detalhe && (
        <p className="flex items-start gap-1.5 border-t border-destructive/20 pt-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 break-all font-mono">{teste.detalhe}</span>
        </p>
      )}
    </div>
  );
}

/**
 * Só para o super-admin: este card vem do catálogo (Super-admin › Integrações
 * da IA). Nome, descrição, ações, endereço e chave são de lá; daqui só saem o
 * liga/desliga, as ações escolhidas e o ID do restaurante deste WhatsApp.
 */
function OrigemDoCatalogo({ origem, nome }: { origem: IntegrationOrigin; nome: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground sm:px-6">
      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
      <span>
        Super-admin: vem de <span className="font-medium text-foreground">Integrações da IA › {nome}</span>
      </span>
      <span>·</span>
      <span className="font-mono">{origem.endereco}</span>
      <span>·</span>
      <span className={origem.temChave ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}>
        {origem.temChave ? 'chave cadastrada' : 'sem chave cadastrada'}
      </span>
      <Link href={origem.href} className="ml-auto inline-flex items-center gap-1 text-primary hover:underline max-sm:min-h-9">
        Editar no catálogo
        <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}

/** A IA tentou usar o sistema e falhou (e ainda não voltou a funcionar). */
function ProblemaRecente({ problema }: { problema: IntegrationProblem }) {
  const vezes = problema.vezes === 1 ? '1 vez' : `${problema.vezes} vezes`;
  return (
    <div role="alert" className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <p className="flex items-start gap-1.5 font-medium text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{problema.titulo}</span>
      </p>
      <p>{problema.motivo}</p>
      {problema.oQueFazer && (
        <p>
          <span className="font-medium">O que fazer: </span>
          {problema.oQueFazer}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Aconteceu {vezes} nas últimas 24h · última {problema.quando}
        {problema.ferramentas.length > 0 && ` · ${problema.ferramentas.join(', ')}`}
      </p>
    </div>
  );
}

/**
 * Um sistema conectado (ex.: reservas) como UM grupo: chave geral, ID do
 * restaurante deste WhatsApp, teste e as habilidades. Tudo salva na hora.
 */
export function IntegrationCard({ integration, inbox, canEdit }: Props) {
  const save = useSaveIntegration();
  const test = useTestIntegration();
  const saveId = useSaveRestaurantId();

  const [enabled, setEnabled] = useState(integration.enabled);
  const [tools, setTools] = useState<string[]>(integration.enabledTools);

  // Acompanha o que está salvo, sem atropelar um clique que ainda está salvando.
  const pendente = useRef(false);
  pendente.current = save.isPending;
  const assinatura = JSON.stringify([integration.enabled, [...integration.enabledTools].sort()]);
  useEffect(() => {
    if (pendente.current) return;
    setEnabled(integration.enabled);
    setTools(integration.enabledTools);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura]);

  // ID do restaurante deste WhatsApp.
  const idSalvo = inbox.restaurantId;
  const [idDraft, setIdDraft] = useState(idSalvo ?? '');
  const [idOk, setIdOk] = useState(false);
  useEffect(() => {
    setIdDraft(idSalvo ?? '');
  }, [idSalvo]);

  const todas = integration.tools.map((t) => t.name);
  const bloqueado = !canEdit;
  const titulo = integration.needsRestaurantId ? `Reservas no ${integration.name}` : integration.name;
  const semId = integration.needsRestaurantId && !idSalvo && !idDraft.trim();

  const gravar = (
    proximo: { enabled: boolean; tools: string[] },
    anterior: { enabled: boolean; tools: string[] },
    mensagem: string
  ) => {
    setEnabled(proximo.enabled);
    setTools(proximo.tools);
    save.mutate(
      { integrationId: integration.id, enabled: proximo.enabled, enabledTools: proximo.tools },
      {
        onSuccess: () => toast.success(mensagem, { duration: 1500 }),
        onError: (error) => {
          setEnabled(anterior.enabled);
          setTools(anterior.tools);
          toast.error(error.message);
        },
      }
    );
  };

  const alternarGeral = (ligar: boolean) => {
    const anterior = { enabled, tools };
    // Ligando sem nada marcado: a IA pode fazer tudo (a pessoa desliga o que não quiser).
    const proximasTools = ligar && tools.length === 0 ? todas : tools;
    gravar({ enabled: ligar, tools: proximasTools }, anterior, 'Salvo');
  };

  const alternarHabilidade = (nome: string, ligar: boolean) => {
    const anterior = { enabled, tools };
    const proximas = ligar ? [...new Set([...tools, nome])] : tools.filter((n) => n !== nome);
    gravar({ enabled, tools: proximas }, anterior, 'Salvo');
  };

  const salvarId = () => {
    const novo = idDraft.trim();
    if (novo === (idSalvo ?? '')) return;
    saveId.mutate(
      { inboxId: inbox.id, restaurantId: novo },
      {
        onSuccess: () => {
          setIdOk(true);
          window.setTimeout(() => setIdOk(false), 2500);
        },
        onError: (error) => toast.error(error.message),
      }
    );
  };

  const testar = async () => {
    if (integration.needsRestaurantId && !idDraft.trim()) {
      toast.error('Preencha o ID do restaurante antes de testar.');
      return;
    }
    if (integration.needsRestaurantId && idDraft.trim() !== (idSalvo ?? '')) {
      try {
        await saveId.mutateAsync({ inboxId: inbox.id, restaurantId: idDraft });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Não foi possível salvar o ID. Tente de novo.');
        return;
      }
    }
    test.mutate(
      { integrationId: integration.id, inboxId: inbox.id },
      {
        onSuccess: (r) => (r.ok ? toast.success(r.message) : toast.error(r.message)),
        onError: (error) => toast.error(error.message),
      }
    );
  };

  // Resultado do teste que acabou de rodar vale até a lista recarregar.
  const ultimoTeste: IntegrationLastTest | null =
    test.data && (!integration.lastTest || test.data.at >= integration.lastTest.at)
      ? { at: test.data.at, ok: test.data.ok, error: test.data.ok ? null : test.data.message, detalhe: test.data.detalhe }
      : integration.lastTest;

  const switchId = `integration-${integration.id}`;

  return (
    <Card className={cn(enabled && 'border-primary/30')}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Plug className="h-5 w-5 shrink-0 text-primary" />
              <Label htmlFor={switchId} className="cursor-pointer text-lg font-semibold leading-tight">
                {titulo}
              </Label>
            </CardTitle>
            {integration.description && <CardDescription>{integration.description}</CardDescription>}
          </div>
          <Switch
            id={switchId}
            checked={enabled}
            disabled={bloqueado}
            onCheckedChange={alternarGeral}
            className="mt-1 shrink-0"
            aria-label={titulo}
          />
        </div>
      </CardHeader>

      {enabled && (
        <CardContent className="space-y-4 p-0">
          {integration.problemaRecente && (
            <div className="px-4 sm:px-6">
              <ProblemaRecente problema={integration.problemaRecente} />
            </div>
          )}

          {(integration.needsRestaurantId || integration.hasTest) && (
            <div className="space-y-3 px-4 sm:px-6">
              {integration.needsRestaurantId && (
                <div className="space-y-1.5">
                  <Label htmlFor={`${switchId}-id`}>ID do restaurante deste WhatsApp</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id={`${switchId}-id`}
                      value={idDraft}
                      disabled={bloqueado}
                      autoComplete="off"
                      maxLength={120}
                      placeholder="Ex.: 1042"
                      onChange={(e) => setIdDraft(e.target.value)}
                      onBlur={salvarId}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          salvarId();
                        }
                      }}
                      className="max-w-xs"
                    />
                    {saveId.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    {idOk && !saveId.isPending && (
                      <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                        <Check className="h-3.5 w-3.5" />
                        Salvo
                      </span>
                    )}
                  </div>
                  {semId ? (
                    <AmberHint>Preencha o ID para a IA conseguir fazer as reservas neste WhatsApp.</AmberHint>
                  ) : (
                    <p className="text-xs text-muted-foreground">Se não souber qual é, fale com o suporte.</p>
                  )}
                </div>
              )}

              {integration.hasTest && canEdit && (
                <div className="space-y-2">
                  <Button type="button" variant="outline" onClick={testar} disabled={test.isPending || saveId.isPending}>
                    {test.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plug className="mr-2 h-4 w-4" />}
                    {test.isPending ? 'Testando...' : 'Testar conexão'}
                  </Button>
                  <ResultadoTeste teste={ultimoTeste} />
                </div>
              )}
            </div>
          )}

          {integration.tools.length > 0 && (
            <div className="divide-y border-t">
              {integration.tools.map((tool) => (
                <AbilityRow
                  key={tool.name}
                  id={`${switchId}-tool-${tool.name}`}
                  label={tool.label}
                  checked={tools.includes(tool.name)}
                  disabled={bloqueado}
                  onChange={(v) => alternarHabilidade(tool.name, v)}
                />
              ))}
            </div>
          )}
        </CardContent>
      )}
      {!enabled && <CardContent className="p-0" />}
      {integration.origem && <OrigemDoCatalogo origem={integration.origem} nome={integration.name} />}
    </Card>
  );
}

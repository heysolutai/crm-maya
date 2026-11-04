'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Plug, ShieldCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AbilityRow, AmberHint } from './AbilityRow';
import type { IntegrationLastTest, IntegrationOrigin, IntegrationProblem, IntegrationState } from './types';
import { useSaveIntegration, useTestIntegration } from './useIntegrations';

/** O WhatsApp (conexão) em que a pessoa está. */
export interface InboxRef {
  id: string;
  /** ID do restaurante salvo neste WhatsApp (null = ainda não preenchido). */
  restaurantId: string | null;
}

interface Props {
  integration: IntegrationState;
  inbox: InboxRef;
  canEdit: boolean;
  /** Ferramentas ligadas neste WhatsApp. Desligadas = só para ver: tudo apagado, sem mexer. */
  ativo?: boolean;
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
 * Só para o super-admin: de onde vem a integração (Super-admin › Integrações
 * da IA), o teste e o erro técnico. O restaurante não vê nada disso.
 */
function PainelSuperAdmin({
  origem,
  nome,
  teste,
  podeTestar,
  testando,
  onTestar,
}: {
  origem: IntegrationOrigin;
  nome: string;
  teste: IntegrationLastTest | null;
  podeTestar: boolean;
  testando: boolean;
  onTestar: () => void;
}) {
  return (
    <div className="space-y-2 bg-muted/30 px-4 py-3 text-xs text-muted-foreground sm:px-6">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
      {podeTestar && (
        <div className="space-y-2">
          <Button type="button" variant="outline" size="sm" onClick={onTestar} disabled={testando}>
            {testando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plug className="mr-2 h-4 w-4" />}
            {testando ? 'Testando...' : 'Testar conexão'}
          </Button>
          <ResultadoTeste teste={teste} />
        </div>
      )}
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
      </p>
    </div>
  );
}

/**
 * Um sistema conectado (ex.: reservas): ligou a chave, abre o que a IA pode
 * fazer nele; desligou, fecha. Com as ferramentas do WhatsApp desligadas
 * (`ativo` falso) mostra tudo apagado, só para ver. Cada chave salva na hora.
 */
export function IntegrationCard({ integration, inbox, canEdit, ativo = true }: Props) {
  const save = useSaveIntegration();
  const test = useTestIntegration();

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

  const todas = integration.tools.map((t) => t.name);
  const ligada = ativo && enabled;
  const titulo = integration.needsRestaurantId ? `Reservas no ${integration.name}` : integration.name;
  const semVinculo = integration.needsRestaurantId && !inbox.restaurantId;

  const gravar = (
    proximo: { enabled: boolean; tools: string[] },
    anterior: { enabled: boolean; tools: string[] }
  ) => {
    setEnabled(proximo.enabled);
    setTools(proximo.tools);
    save.mutate(
      { integrationId: integration.id, enabled: proximo.enabled, enabledTools: proximo.tools },
      {
        onSuccess: () => toast.success('Salvo', { duration: 1500 }),
        onError: (error) => {
          setEnabled(anterior.enabled);
          setTools(anterior.tools);
          toast.error(error.message);
        },
      }
    );
  };

  const alternarGeral = (ligar: boolean) => {
    // Ligando sem nada marcado: a IA pode fazer tudo (a pessoa desliga o que não quiser).
    const proximasTools = ligar && tools.length === 0 ? todas : tools;
    gravar({ enabled: ligar, tools: proximasTools }, { enabled, tools });
  };

  const alternarHabilidade = (nome: string, ligar: boolean) => {
    const proximas = ligar ? [...new Set([...tools, nome])] : tools.filter((n) => n !== nome);
    gravar({ enabled, tools: proximas }, { enabled, tools });
  };

  const testar = () =>
    test.mutate(
      { integrationId: integration.id, inboxId: inbox.id },
      {
        onSuccess: (r) => (r.ok ? toast.success(r.message) : toast.error(r.message)),
        onError: (error) => toast.error(error.message),
      }
    );

  // Resultado do teste que acabou de rodar vale até a lista recarregar.
  const ultimoTeste: IntegrationLastTest | null =
    test.data && (!integration.lastTest || test.data.at >= integration.lastTest.at)
      ? { at: test.data.at, ok: test.data.ok, error: test.data.ok ? null : test.data.message, detalhe: test.data.detalhe }
      : integration.lastTest;

  const switchId = `integration-${integration.id}`;

  return (
    <div>
      <AbilityRow
        id={switchId}
        label={titulo}
        help={integration.description}
        checked={ligada}
        disabled={!canEdit || !ativo}
        onChange={alternarGeral}
      >
        {ligada && semVinculo && (
          <AmberHint>Este WhatsApp ainda não está ligado ao {integration.name}. Fale com o suporte.</AmberHint>
        )}
        {ligada && integration.problemaRecente && <ProblemaRecente problema={integration.problemaRecente} />}
      </AbilityRow>

      {(ligada || !ativo) &&
        integration.tools.map((tool) => (
          <AbilityRow
            key={tool.name}
            id={`${switchId}-tool-${tool.name}`}
            label={tool.label}
            checked={ligada && tools.includes(tool.name)}
            disabled={!canEdit || !ligada}
            onChange={(v) => alternarHabilidade(tool.name, v)}
            className="py-2 pl-10 sm:pl-12"
          />
        ))}

      {integration.origem && (
        <PainelSuperAdmin
          origem={integration.origem}
          nome={integration.name}
          teste={ultimoTeste}
          podeTestar={integration.hasTest && canEdit}
          testando={test.isPending}
          onTestar={testar}
        />
      )}
    </div>
  );
}

'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, Info, Loader2, RefreshCw, Server, Sparkles, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { CardListSkeleton } from '@/components/ui/table-skeleton';
import { cn } from '@/lib/utils';
import { IntegrationCard } from '@/components/integrations/IntegrationCard';
import { NativeToolsSection } from '@/components/integrations/NativeToolsSection';
import { useIntegrations } from '@/components/integrations/useIntegrations';
import type { IntegrationsState } from '@/components/integrations/types';
import { McpModePanel } from './McpModePanel';
import { useToolMode, type ToolModeState } from './useToolMode';

interface Props {
  /** Conexão (WhatsApp) em que a pessoa está. */
  inboxId: string;
  /** Agente de IA deste WhatsApp: o modo (ferramentas, MCP ou nenhum) é dele. */
  agentId: string;
}

type Modo = ToolModeState['modo'];
type ModoExterno = Exclude<Modo, 'none'>;

function avisoDaTroca(antes: Modo, depois: Modo): string {
  if (depois === 'none') return antes === 'mcp' ? 'Servidor MCP desligado.' : 'Ferramentas desligadas.';
  if (depois === 'mcp') {
    return antes === 'none' ? 'Servidor MCP ligado.' : 'Servidor MCP ligado. As ferramentas foram desligadas.';
  }
  return antes === 'none' ? 'Ferramentas ligadas.' : 'Ferramentas ligadas. O servidor MCP foi desligado.';
}

/**
 * Um modo: a seta abre e fecha para ver o que tem dentro (mesmo desligado,
 * aí tudo aparece apagado); a chave liga e desliga.
 */
function Bloco({
  icon: Icon,
  titulo,
  dica,
  ligado,
  salvando,
  podeMudar,
  onChange,
  aberto,
  onAbrir,
  children,
}: {
  icon: typeof Wrench;
  titulo: string;
  dica: string;
  ligado: boolean;
  salvando: boolean;
  podeMudar: boolean;
  onChange: (ligar: boolean) => void;
  aberto: boolean;
  onAbrir: () => void;
  children: ReactNode;
}) {
  return (
    <Card className={cn('overflow-hidden', ligado && 'border-primary/30')}>
      <div className="flex items-center gap-3 px-4 py-4 sm:px-6">
        <button
          type="button"
          onClick={onAbrir}
          aria-expanded={aberto}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          {salvando ? (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
          ) : (
            <Icon className={cn('h-5 w-5 shrink-0', ligado ? 'text-primary' : 'text-muted-foreground')} />
          )}
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{titulo}</span>
            <span className="block text-sm text-muted-foreground">{dica}</span>
          </span>
          <ChevronDown
            className={cn('h-5 w-5 shrink-0 text-muted-foreground transition-transform', aberto && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
        <Switch
          checked={ligado}
          disabled={!podeMudar}
          onCheckedChange={onChange}
          className="shrink-0"
          aria-label={ligado ? `Desligar ${titulo}` : `Ligar ${titulo}`}
        />
      </div>
      {aberto && <div className={cn('border-t', !ligado && 'opacity-70')}>{children}</div>}
    </Card>
  );
}

/**
 * Agente de IA › Ferramentas:
 *   1. O que a IA faz dentro do CRM: vale sempre, cada coisa com sua chave.
 *   2. Ferramentas de fora (function calls) ou Servidor MCP: só um ligado por
 *      vez, os dois desligados também pode. A seta mostra o que tem dentro.
 * Cada chave salva na hora; sem botão de salvar.
 */
export function ToolsTab({ inboxId, agentId }: Props) {
  const { data, isLoading, isError, refetch, isFetching } = useIntegrations();
  const { query: modoQuery, trocarModo } = useToolMode(agentId);
  // Aberto/fechado escolhido pela pessoa; sem escolha, aberto = ligado.
  const [abertos, setAbertos] = useState<Partial<Record<ModoExterno, boolean>>>({});

  if (isLoading || modoQuery.isLoading) return <CardListSkeleton count={3} />;

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">Não foi possível carregar as opções da IA.</p>
        <Button
          variant="outline"
          onClick={() => {
            refetch();
            modoQuery.refetch();
          }}
          disabled={isFetching || modoQuery.isFetching}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Tentar de novo
        </Button>
      </div>
    );
  }

  // Sem o modo (falha ao ler): as ferramentas aparecem como sempre, sem as chaves de modo.
  const estado: ToolModeState | null = modoQuery.data ?? null;
  const modo: Modo = trocarModo.isPending && trocarModo.variables ? trocarModo.variables : estado?.modo ?? 'function_calls';
  const variosWhatsApp = data.restaurantIds.length > 1;

  const aberto = (m: ModoExterno) => abertos[m] ?? modo === m;
  const alternarAberto = (m: ModoExterno) => setAbertos((atual) => ({ ...atual, [m]: !aberto(m) }));

  const alternar = (m: ModoExterno, ligar: boolean) => {
    const novo: Modo = ligar ? m : 'none';
    if (!estado || novo === estado.modo || !data.canEdit) return;
    const antes = estado.modo;
    if (ligar) setAbertos((atual) => ({ ...atual, [m]: true }));
    trocarModo.mutate(novo, {
      onSuccess: () => toast.success(avisoDaTroca(antes, novo)),
      onError: (e) => toast.error(e.message),
    });
  };
  const salvando = (m: ModoExterno) =>
    trocarModo.isPending && (trocarModo.variables === m || (trocarModo.variables === 'none' && estado?.modo === m));

  const notaVariosWhatsApp = variosWhatsApp && (
    <p className="px-4 py-3 text-xs text-muted-foreground sm:px-6">Estas opções valem para todos os WhatsApp do restaurante.</p>
  );

  return (
    <div className="space-y-4">
      {!data.canEdit && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>Só o administrador do restaurante pode mudar estas opções.</AlertDescription>
        </Alert>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-4 sm:px-6">
          <Sparkles className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="font-semibold">O que a IA pode fazer no CRM</p>
            <p className="text-sm text-muted-foreground">Vale sempre, com ou sem as ferramentas de baixo.</p>
          </div>
        </div>
        <div className="divide-y border-t">
          <NativeToolsSection native={data.native} tools={data.native} canEdit={data.canEdit} />
          {notaVariosWhatsApp}
        </div>
      </Card>

      {estado ? (
        <>
          <div className="pt-2">
            <p className="text-sm font-medium">Ferramentas de fora do CRM</p>
            <p className="text-sm text-muted-foreground">Só uma fica ligada por vez, e as duas desligadas também pode.</p>
          </div>

          <Bloco
            icon={Wrench}
            titulo="Ferramentas (function calls)"
            dica="Sistemas que o suporte conecta, como o de reservas."
            ligado={modo === 'function_calls'}
            salvando={salvando('function_calls')}
            podeMudar={data.canEdit && !trocarModo.isPending}
            onChange={(ligar) => alternar('function_calls', ligar)}
            aberto={aberto('function_calls')}
            onAbrir={() => alternarAberto('function_calls')}
          >
            <Integracoes data={data} inboxId={inboxId} ativo={modo === 'function_calls'} nota={notaVariosWhatsApp} />
          </Bloco>

          <Bloco
            icon={Server}
            titulo="Servidor MCP"
            dica="O sistema de vocês tem MCP? Conecte e a IA usa as ferramentas dele."
            ligado={modo === 'mcp'}
            salvando={salvando('mcp')}
            podeMudar={data.canEdit && !trocarModo.isPending}
            onChange={(ligar) => alternar('mcp', ligar)}
            aberto={aberto('mcp')}
            onAbrir={() => alternarAberto('mcp')}
          >
            <McpModePanel
              key={estado.conexao?.endereco ?? 'novo'}
              agentId={agentId}
              estado={estado}
              canEdit={data.canEdit}
              ativo={modo === 'mcp'}
            />
          </Bloco>
        </>
      ) : (
        <Card className="overflow-hidden">
          <Integracoes data={data} inboxId={inboxId} ativo nota={notaVariosWhatsApp} />
        </Card>
      )}
    </div>
  );
}

/** As integrações do catálogo (ex.: reservas), uma embaixo da outra. */
function Integracoes({
  data,
  inboxId,
  ativo,
  nota,
}: {
  data: IntegrationsState;
  inboxId: string;
  ativo: boolean;
  nota: ReactNode;
}) {
  const restaurantId = data.restaurantIds.find((r) => r.inboxId === inboxId)?.restaurantId ?? null;
  if (data.integrations.length === 0) {
    return <p className="px-4 py-3 text-sm text-muted-foreground sm:px-6">Nenhuma ferramenta disponível ainda. Fale com o suporte.</p>;
  }
  return (
    <div className="divide-y">
      {data.integrations.map((integration) => (
        <IntegrationCard
          key={integration.id}
          integration={integration}
          inbox={{ id: inboxId, restaurantId }}
          canEdit={data.canEdit}
          ativo={ativo}
        />
      ))}
      {nota}
    </div>
  );
}

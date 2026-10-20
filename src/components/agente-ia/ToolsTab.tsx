'use client';

import { Info, Loader2, RefreshCw, Server, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CardListSkeleton } from '@/components/ui/table-skeleton';
import { IntegrationCard } from '@/components/integrations/IntegrationCard';
import { NativeToolsSection } from '@/components/integrations/NativeToolsSection';
import { useIntegrations } from '@/components/integrations/useIntegrations';
import { cn } from '@/lib/utils';
import { McpModePanel } from './McpModePanel';
import { useToolMode, type ToolModeState } from './useToolMode';

interface Props {
  /** Conexão (WhatsApp) em que a pessoa está: o ID do restaurante é dela. */
  inboxId: string;
  /** Agente de IA deste WhatsApp: o modo (function calls ou MCP) é dele. */
  agentId: string;
}

const MODOS: { value: ToolModeState['modo']; titulo: string; dica: string; icon: typeof Wrench }[] = [
  {
    value: 'function_calls',
    titulo: 'Ferramentas do CRM (function calls)',
    dica: 'Reservas, eventos, perguntas e respostas e transferir: tudo pronto, é só ligar.',
    icon: Wrench,
  },
  {
    value: 'mcp',
    titulo: 'Servidor MCP',
    dica: 'O sistema de vocês tem MCP? Cole o endereço e a IA usa as ferramentas dele.',
    icon: Server,
  },
];

/**
 * Agente de IA › Ferramentas: primeiro o modo deste WhatsApp (ferramentas do
 * CRM ou servidor MCP), depois a lista simples do que a IA pode fazer. Cada
 * chave salva na hora; sem botão de salvar.
 */
export function ToolsTab({ inboxId, agentId }: Props) {
  const { data, isLoading, isError, refetch, isFetching } = useIntegrations();
  const { query: modoQuery, trocarModo } = useToolMode(agentId);

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

  // Sem agente de IA neste WhatsApp (ou falha ao ler o modo): só as ferramentas do CRM, como sempre.
  const estado: ToolModeState | null = modoQuery.data ?? null;
  const modo = trocarModo.isPending && trocarModo.variables ? trocarModo.variables : estado?.modo ?? 'function_calls';
  const restaurantId = data.restaurantIds.find((r) => r.inboxId === inboxId)?.restaurantId ?? null;
  const variosWhatsApp = data.restaurantIds.length > 1;

  const escolher = (novo: ToolModeState['modo']) => {
    if (!estado || novo === estado.modo || !data.canEdit) return;
    trocarModo.mutate(novo, {
      onSuccess: () =>
        toast.success(novo === 'mcp' ? 'Modo Servidor MCP ligado neste WhatsApp.' : 'Modo ferramentas do CRM ligado neste WhatsApp.'),
      onError: (e) => toast.error(e.message),
    });
  };

  return (
    <div className="space-y-6">
      {!data.canEdit && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>Só o administrador do restaurante pode mudar estas opções.</AlertDescription>
        </Alert>
      )}

      {estado && (
      <div className="space-y-2">
        <p className="text-sm font-medium">Como a IA deste WhatsApp usa ferramentas</p>
        <div role="radiogroup" aria-label="Como a IA usa ferramentas" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {MODOS.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={modo === m.value}
              disabled={!data.canEdit || trocarModo.isPending}
              onClick={() => escolher(m.value)}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed',
                modo === m.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border/60 hover:border-primary/40'
              )}
            >
              {trocarModo.isPending && trocarModo.variables === m.value ? (
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
              ) : (
                <m.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              )}
              <span>
                <span className="block text-sm font-medium">{m.titulo}</span>
                <span className="block text-xs text-muted-foreground">{m.dica}</span>
              </span>
            </button>
          ))}
        </div>
        {modo === 'mcp' && !estado.conexao && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Enquanto o servidor não for conectado, a IA deste WhatsApp só consegue transferir para um atendente.
          </p>
        )}
      </div>
      )}

      {modo === 'mcp' && estado ? (
        <McpModePanel key={estado.conexao?.endereco ?? 'novo'} agentId={agentId} estado={estado} canEdit={data.canEdit} native={data.native} />
      ) : (
        <>
          {variosWhatsApp && (
            <p className="text-sm text-muted-foreground">Estas opções valem para todos os WhatsApp do restaurante.</p>
          )}

          <NativeToolsSection native={data.native} canEdit={data.canEdit} />

          {data.integrations.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              inbox={{ id: inboxId, restaurantId }}
              canEdit={data.canEdit}
            />
          ))}
        </>
      )}
    </div>
  );
}

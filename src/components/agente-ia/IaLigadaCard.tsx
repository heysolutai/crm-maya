'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, Loader2, PowerOff } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAIConfigurations } from '@/hooks/useAIConfigurations';
import { apiFetch } from '@/lib/api/client';
import { cn } from '@/lib/utils';

interface Props {
  companyId: string;
  /** Agente de IA deste WhatsApp. */
  agentId: string;
}

/**
 * Chave geral "IA atendendo" do WhatsApp (AiAgent.isActive). Desligada, a IA
 * não responde nenhum cliente deste número (n8n e Maestro) e o follow-up para;
 * as mensagens continuam chegando em Atendimentos para a equipe.
 */
export function IaLigadaCard({ companyId, agentId }: Props) {
  const queryClient = useQueryClient();
  const { configurations, isLoading } = useAIConfigurations({ companyId, agentId });
  const config = configurations?.[0];
  const [confirmarDesligar, setConfirmarDesligar] = useState(false);

  const salvar = useMutation({
    mutationFn: async (ligar: boolean) => {
      if (!config) throw new Error('Agente de IA não encontrado.');
      // ?companyId= e como o super-admin personificando chega no servidor.
      const res = await apiFetch(`/api/ai-configurations?companyId=${encodeURIComponent(companyId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: config.id, is_active: ligar }),
      });
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => null);
        const erro = data && typeof data === 'object' ? (data as { error?: unknown }).error : null;
        throw new Error(typeof erro === 'string' && erro ? erro : 'Não foi possível salvar. Tente de novo.');
      }
    },
    onSuccess: (_dados, ligar) => {
      queryClient.invalidateQueries({ queryKey: ['ai-configurations'] });
      queryClient.invalidateQueries({ queryKey: ['ai-health'] });
      toast.success(
        ligar
          ? 'IA ligada: ela volta a responder os clientes deste WhatsApp.'
          : 'IA desligada: só a equipe responde neste WhatsApp.'
      );
    },
    onError: (error) => toast.error(error.message),
  });

  if (isLoading || !config) return null;

  const ligada = config.is_active !== false;
  // Enquanto salva, mostra o estado pedido.
  const mostrada = salvar.isPending && salvar.variables !== undefined ? salvar.variables : ligada;
  const id = `ia-ligada-${config.id}`;

  const alternar = (ligar: boolean) => {
    if (ligar) salvar.mutate(true);
    else setConfirmarDesligar(true);
  };

  return (
    <>
      <div
        className={cn(
          'flex items-center justify-between gap-4 rounded-xl border p-4',
          mostrada ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-amber-500/50 bg-amber-500/10'
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              mostrada ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
            )}
          >
            {mostrada ? <Bot className="h-5 w-5" /> : <PowerOff className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <Label htmlFor={id} className="cursor-pointer text-base font-semibold">
              {mostrada ? 'IA atendendo' : 'IA desligada'}
            </Label>
            <p className="text-sm text-muted-foreground">
              {mostrada
                ? 'A IA responde os clientes deste WhatsApp. Desligue se só a equipe deve responder.'
                : 'A IA não responde ninguém neste WhatsApp: só a equipe atende. As mensagens continuam chegando em Atendimentos.'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {salvar.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Switch
            id={id}
            checked={mostrada}
            disabled={salvar.isPending}
            onCheckedChange={alternar}
            aria-label={mostrada ? 'Desligar a IA deste WhatsApp' : 'Ligar a IA deste WhatsApp'}
          />
        </div>
      </div>

      <ConfirmDialog
        open={confirmarDesligar}
        onOpenChange={setConfirmarDesligar}
        title="Desligar a IA deste WhatsApp?"
        description="A IA para de responder os clientes deste WhatsApp na hora (e os follow-ups automáticos também). As mensagens continuam chegando em Atendimentos para a equipe responder. Dá para ligar de novo aqui quando quiser."
        confirmLabel="Desligar IA"
        variant="destructive"
        isLoading={salvar.isPending}
        onConfirm={async () => {
          try {
            await salvar.mutateAsync(false);
          } finally {
            setConfirmarDesligar(false);
          }
        }}
      />
    </>
  );
}

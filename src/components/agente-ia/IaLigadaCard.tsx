'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, Loader2, PowerOff, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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

/** O que salvar: ligar/desligar e, ao ligar, para todos (null) ou só um número. */
interface Pedido {
  ligar: boolean;
  numero?: string | null;
}

function soDigitos(v: string): string {
  return v.replace(/\D/g, '');
}

/** 5562999197953 -> (62) 99919-7953 */
function formatarTelefone(digitos: string): string {
  const d = digitos.length >= 12 && digitos.startsWith('55') ? digitos.slice(2) : digitos;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digitos;
}

/**
 * Chave geral "IA atendendo" do WhatsApp (AiAgent.isActive). Ligar pergunta
 * para quem: todos os clientes ou só um número (teste, AiAgent.onlyPhone).
 * Desligada, a IA não responde ninguém deste número (n8n e Maestro) e o
 * follow-up para; as mensagens continuam chegando em Atendimentos.
 */
export function IaLigadaCard({ companyId, agentId }: Props) {
  const queryClient = useQueryClient();
  const { configurations, isLoading } = useAIConfigurations({ companyId, agentId });
  const config = configurations?.[0];
  const [confirmarDesligar, setConfirmarDesligar] = useState(false);
  const [escolherQuem, setEscolherQuem] = useState(false);
  const [numero, setNumero] = useState('');

  const salvar = useMutation({
    mutationFn: async ({ ligar, numero: soEste }: Pedido) => {
      if (!config) throw new Error('Agente de IA não encontrado.');
      // ?companyId= e como o super-admin personificando chega no servidor.
      const res = await apiFetch(`/api/ai-configurations?companyId=${encodeURIComponent(companyId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: config.id,
          is_active: ligar,
          ...(soEste !== undefined ? { only_phone: soEste } : {}),
        }),
      });
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => null);
        const erro = data && typeof data === 'object' ? (data as { error?: unknown }).error : null;
        throw new Error(typeof erro === 'string' && erro ? erro : 'Não foi possível salvar. Tente de novo.');
      }
    },
    onSuccess: (_dados, { ligar, numero: soEste }) => {
      queryClient.invalidateQueries({ queryKey: ['ai-configurations'] });
      queryClient.invalidateQueries({ queryKey: ['ai-health'] });
      setEscolherQuem(false);
      toast.success(
        !ligar
          ? 'IA desligada: só a equipe responde neste WhatsApp.'
          : soEste
            ? `IA ligada só para ${formatarTelefone(soEste)}. Os outros clientes ficam com a equipe.`
            : 'IA ligada para todos os clientes deste WhatsApp.'
      );
    },
    onError: (error) => toast.error(error.message),
  });

  if (isLoading || !config) return null;

  const ligada = config.is_active !== false;
  const soNumero = config.only_phone || null;
  // Enquanto salva, mostra o estado pedido.
  const mostrada = salvar.isPending && salvar.variables ? salvar.variables.ligar : ligada;
  const id = `ia-ligada-${config.id}`;
  const numeroOk = soDigitos(numero).length >= 10 && soDigitos(numero).length <= 13;

  const alternar = (ligar: boolean) => {
    if (ligar) {
      setNumero(soNumero ? formatarTelefone(soNumero) : '');
      setEscolherQuem(true);
    } else {
      setConfirmarDesligar(true);
    }
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
          <div className="min-w-0 space-y-2">
            <div>
              <Label htmlFor={id} className="cursor-pointer text-base font-semibold">
                {!mostrada ? 'IA desligada' : soNumero ? 'IA atendendo só um número' : 'IA atendendo'}
              </Label>
              <p className="text-sm text-muted-foreground">
                {!mostrada
                  ? 'A IA não responde ninguém neste WhatsApp: só a equipe atende. As mensagens continuam chegando em Atendimentos.'
                  : soNumero
                    ? `A IA responde só ${formatarTelefone(soNumero)}. Os outros clientes ficam com a equipe.`
                    : 'A IA responde todos os clientes deste WhatsApp. Desligue se só a equipe deve responder.'}
              </p>
            </div>
            {ligada && soNumero && (
              <Button
                variant="outline"
                size="sm"
                disabled={salvar.isPending}
                onClick={() => salvar.mutate({ ligar: true, numero: null })}
              >
                <Users className="mr-2 h-4 w-4" />
                Ligar para todos
              </Button>
            )}
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

      <Dialog open={escolherQuem} onOpenChange={(v) => !salvar.isPending && setEscolherQuem(v)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Ligar a IA para quem?</DialogTitle>
            <DialogDescription>Dá para mudar depois aqui mesmo.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Button
              className="w-full"
              disabled={salvar.isPending}
              onClick={() => salvar.mutate({ ligar: true, numero: null })}
            >
              <Users className="mr-2 h-4 w-4" />
              Para todos os clientes
            </Button>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              ou
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${id}-numero`}>Só para um número (para testar)</Label>
              <p className="text-xs text-muted-foreground">A IA responde só este número; os outros clientes ficam com a equipe.</p>
              <div className="flex gap-2">
                <Input
                  id={`${id}-numero`}
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && numeroOk && !salvar.isPending) {
                      salvar.mutate({ ligar: true, numero: soDigitos(numero) });
                    }
                  }}
                  placeholder="(62) 99999-9999"
                  inputMode="tel"
                  autoComplete="off"
                />
                <Button
                  variant="outline"
                  className="shrink-0"
                  disabled={!numeroOk || salvar.isPending}
                  onClick={() => salvar.mutate({ ligar: true, numero: soDigitos(numero) })}
                >
                  {salvar.isPending && salvar.variables?.numero ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Ligar só este
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
            await salvar.mutateAsync({ ligar: false });
          } finally {
            setConfirmarDesligar(false);
          }
        }}
      />
    </>
  );
}

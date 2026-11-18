'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlaygroundChat } from '@/components/ai/PlaygroundChat';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';
import { useInboxes } from '@/hooks/useInboxes';
import { useRegrasEncaminhamento } from '@/hooks/useSolicitacoes';
import type { Funil } from '@/lib/solicitacoes/funis';
import { cn } from '@/lib/utils';

/** Frases que NÃO devem encaminhar (a IA tem que resolver sozinha). */
const NAO_ENCAMINHA: Record<Funil, string[]> = {
  eventos: ['Quero reservar uma mesa para 4 pessoas no sábado às 20h', 'Vou comemorar meu aniversário aí, dá para reservar para 6?'],
  atendimento: ['Oi, tudo bem?', 'Qual o horário de funcionamento?'],
};

function Frase({ texto, tipo }: { texto: string; tipo: 'sim' | 'nao' }) {
  const copiar = () =>
    navigator.clipboard.writeText(texto).then(
      () => toast.success('Frase copiada. Cole na conversa de teste.'),
      () => toast.error('Não foi possível copiar.')
    );
  return (
    <li>
      <button
        type="button"
        onClick={copiar}
        className="group flex w-full items-start gap-2 rounded-lg border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-primary/40"
        title="Copiar"
      >
        {tipo === 'sim' ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
        <span className="flex-1">{texto}</span>
        <Copy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    </li>
  );
}

/**
 * "Testar a IA" dentro das Regras: o mesmo playground da conexão, para validar
 * na hora se a IA reconhece os gatilhos, pede os dados certos e responde como
 * a regra manda. Nada é gravado nem enviado.
 */
export function TestarRegras({ funil }: { funil: Funil }) {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const { inboxes, isLoading } = useInboxes();
  const { lista } = useRegrasEncaminhamento();
  const conexoes = useMemo(
    () => inboxes.filter((i) => i.ai_agent_id && i.channel_type !== 'espelho'),
    [inboxes]
  );
  const [inboxId, setInboxId] = useState<string | null>(null);
  useEffect(() => {
    if (!inboxId && conexoes.length) setInboxId(conexoes[0].id);
  }, [conexoes, inboxId]);
  const escolhida = conexoes.find((c) => c.id === inboxId) ?? null;

  const regras = (lista.data ?? []).filter((r) => r.funnel === funil && r.isActive && !r.isSystem);
  const encaminham = regras.flatMap((r) => r.examples.slice(0, 2)).slice(0, 5);

  return (
    <div className="flex-1 overflow-y-auto bg-muted/20 px-6 py-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-3">
          {conexoes.length > 1 && (
            <div className="flex flex-wrap items-center gap-3">
              <Label className="shrink-0">Testar com o WhatsApp</Label>
              <Select value={inboxId ?? undefined} onValueChange={setInboxId}>
                <SelectTrigger className="w-full sm:w-72">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {conexoes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.display_name || c.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {isLoading ? null : !companyId || !escolhida?.ai_agent_id ? (
            <div className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
              Nenhum WhatsApp com agente de IA. Configure a IA em Conexões › Agente de IA para testar aqui.
            </div>
          ) : (
            <PlaygroundChat key={escolhida.id} companyId={companyId} agentId={escolhida.ai_agent_id} inboxId={escolhida.id} />
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
          <div className={cn('rounded-2xl border bg-card p-4')}>
            <p className="text-sm font-semibold">Como testar</p>
            <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
              Converse como se fosse o cliente. É o mesmo prompt e as mesmas regras do atendimento real, mas nada é gravado nem
              enviado. Clique numa frase para copiar.
            </p>
          </div>
          {encaminham.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deve encaminhar</p>
              <ul className="space-y-1.5">
                {encaminham.map((f) => (
                  <Frase key={f} texto={f} tipo="sim" />
                ))}
              </ul>
            </div>
          )}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Não deve encaminhar</p>
            <ul className="space-y-1.5">
              {NAO_ENCAMINHA[funil].map((f) => (
                <Frase key={f} texto={f} tipo="nao" />
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

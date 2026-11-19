'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Eye, Loader2, Store, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useInboxes } from '@/hooks/useInboxes';
import { apiFetch } from '@/lib/api/client';
import { PERFIS, perfilDoAgente } from '@/lib/agentProfile';

interface Props {
  companyId: string;
  agentId: string;
}

interface PartesDoPrompt {
  agente: string;
  regras: string;
  ferramentas: string;
  contexto: string;
}

interface Previa {
  motor: 'n8n' | 'maestro';
  /** Nada salvo na aba Prompt: a parte 1 é o texto padrão do sistema. */
  textoPadrao: boolean;
  partes: PartesDoPrompt;
}

/** As 4 partes, na ordem em que a IA recebe, com a origem de cada uma. */
const SECOES: { chave: keyof PartesDoPrompt; titulo: string; origem: string }[] = [
  {
    chave: 'agente',
    titulo: '1. Texto do agente',
    origem: 'Vem desta aba (Prompt): o texto montado pelo modo simples ou o escrito no prompt avançado.',
  },
  { chave: 'regras', titulo: '2. Regras de conversa no WhatsApp', origem: 'Fixas do sistema, iguais para todo agente.' },
  {
    chave: 'ferramentas',
    titulo: '3. Ferramentas: quando e como usar',
    origem: 'Montado sozinho a partir das ferramentas ligadas (aba Ferramentas) e das regras do CRM (Regras e avisos).',
  },
  {
    chave: 'contexto',
    titulo: '4. Contexto do atendimento',
    origem: 'Data, calendário e nome do cliente, preenchidos a cada conversa (aqui, um exemplo).',
  },
];

/**
 * Topo da aba Prompt, numa linha: o tipo do agente (vem da conexão: com ID do
 * Reserve Maya é Restaurante Reserve Maya, sem ID é Personalizado; não se
 * troca) e "Ver o que a IA recebe" (o prompt inteiro, em 4 partes).
 */
export function CabecalhoPrompt({ companyId, agentId }: Props) {
  const { role, isSuperAdmin } = useAuth();
  const { inboxes } = useInboxes();
  const [aberto, setAberto] = useState(false);

  const perfil = perfilDoAgente(agentId, inboxes);
  const { label, hint, porque } = PERFIS[perfil];
  const Icone = perfil === 'reserve_maya' ? UtensilsCrossed : Store;
  const podeVer = isSuperAdmin || role === 'company_admin';

  const previa = useQuery({
    queryKey: ['ai-prompt-preview', companyId, agentId],
    queryFn: async (): Promise<Previa> => {
      const p = new URLSearchParams({ agentId, companyId });
      const res = await apiFetch(`/api/ai-configurations/preview?${p}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Não foi possível montar o prompt.');
      return body as Previa;
    },
    enabled: aberto,
    staleTime: 0,
  });
  const dados = previa.data;

  const copiar = async () => {
    if (!dados) return;
    const p = dados.partes;
    try {
      await navigator.clipboard.writeText([p.agente, p.regras, p.ferramentas, p.contexto].filter(Boolean).join('\n\n'));
      toast.success('Prompt copiado.');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <span
            title={porque}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-medium"
          >
            <Icone className="h-3.5 w-3.5 text-primary" aria-hidden />
            {label}
          </span>
          <span className="text-[13px] text-muted-foreground">{hint}</span>
        </div>
        {podeVer && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAberto(true)}
            className="ml-auto h-8 shrink-0 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
          >
            <Eye className="h-4 w-4" />
            Ver o que a IA recebe
          </Button>
        )}
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 p-0">
          <DialogHeader className="space-y-1 border-b px-6 py-4 text-left">
            <DialogTitle>O que a IA recebe</DialogTitle>
            <DialogDescription>
              O prompt inteiro, na ordem em que a IA recebe: o texto desta aba (de um modo só, simples ou avançado) e as
              partes que o sistema monta sozinho.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {previa.isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : previa.error ? (
              <p className="py-8 text-center text-sm text-destructive">{(previa.error as Error).message}</p>
            ) : dados ? (
              <>
                {dados.motor === 'n8n' && (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
                    Este WhatsApp responde pelo <strong>n8n</strong>, que monta o próprio prompt no fluxo. Abaixo está o
                    que a IA do CRM (Maestro) receberia.
                  </p>
                )}
                {SECOES.map((s) => {
                  const texto = dados.partes[s.chave];
                  return (
                    <section key={s.chave} className="space-y-1.5">
                      <h3 className="text-sm font-semibold">{s.titulo}</h3>
                      <p className="text-xs text-muted-foreground">
                        {s.chave === 'agente' && dados.textoPadrao
                          ? 'Nada salvo ainda na aba Prompt: a IA usa este texto padrão do sistema.'
                          : s.origem}
                      </p>
                      {texto ? (
                        <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
                          {texto}
                        </pre>
                      ) : (
                        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                          {s.chave === 'ferramentas' ? 'Nenhuma ferramenta ligada.' : 'Vazio.'}
                        </p>
                      )}
                    </section>
                  );
                })}
              </>
            ) : null}
          </div>

          <div className="flex justify-end border-t px-6 py-3">
            <Button variant="outline" size="sm" onClick={copiar} disabled={!dados} className="gap-1.5">
              <Copy className="h-4 w-4" />
              Copiar tudo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

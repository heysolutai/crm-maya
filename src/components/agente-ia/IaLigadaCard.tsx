'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, Check, Loader2, Pencil, Plus, PowerOff, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAIConfigurations } from '@/hooks/useAIConfigurations';
import { apiFetch } from '@/lib/api/client';
import { MAX_NUMEROS_TESTE, mesmoTelefone, numerosDoTeste } from '@/lib/ai/so-um-numero';
import { cn } from '@/lib/utils';

interface Props {
  companyId: string;
  /** Agente de IA deste WhatsApp. */
  agentId: string;
}

/** O que salvar: ligar/desligar e, ao ligar, para todos (null) ou só os números de teste. */
interface Pedido {
  ligar: boolean;
  numeros?: string[] | null;
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

/** Máscara nacional enquanto digita: (4 → (41 → (41) 9986 → (41) 9986-7 → (41) 99867-9696. */
function mascaraNacional(d: string): string {
  if (d.length === 0) return '';
  // Separador só aparece quando já há dígito depois dele: assim o Backspace apaga sem travar.
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  // Celular (9 dígitos depois do DDD): 99867-9696. Até 8: 9867-9696.
  const corte = resto.length === 9 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/** Máscara do campo: (41) 99867-9696, ou +55 (41) 99867-9696 quando vem com o 55 na frente. */
function mascararTelefone(valor: string): string {
  const d = soDigitos(valor).slice(0, 13);
  if (d.length > 11 && d.startsWith('55')) return `+55 ${mascaraNacional(d.slice(2))}`;
  return mascaraNacional(d.slice(0, 11));
}

function numeroValido(digitos: string): boolean {
  return digitos.length >= 10 && digitos.length <= 13;
}

/** Por que este número não entra na lista (null = entra). */
function problemaDoNumero(digitos: string, lista: string[]): string | null {
  if (!numeroValido(digitos)) return 'Número inválido: use DDD + número.';
  if (lista.some((n) => mesmoTelefone(n, digitos))) return 'Este número já está na lista.';
  if (lista.length >= MAX_NUMEROS_TESTE) return `No máximo ${MAX_NUMEROS_TESTE} números de teste.`;
  return null;
}

/** Números em "pílulas", com ou sem o botão de tirar. */
function ListaNumeros({ numeros, onRemover }: { numeros: string[]; onRemover?: (n: string) => void }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {numeros.map((n) => (
        <li
          key={n}
          className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium tabular-nums"
        >
          {formatarTelefone(n)}
          {onRemover && (
            <button
              type="button"
              onClick={() => onRemover(n)}
              className="-mr-1 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Tirar ${formatarTelefone(n)} da lista`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Chave geral "IA atendendo" do WhatsApp (AiAgent.isActive). Ligar pergunta
 * para quem: todos os clientes ou só alguns números (teste, AiAgent.onlyPhone).
 * Desligada, a IA não responde ninguém deste número (n8n e Maestro) e o
 * follow-up para; as mensagens continuam chegando em Atendimentos.
 */
export function IaLigadaCard({ companyId, agentId }: Props) {
  const queryClient = useQueryClient();
  const { configurations, isLoading } = useAIConfigurations({ companyId, agentId });
  const config = configurations?.[0];
  const [confirmarDesligar, setConfirmarDesligar] = useState(false);
  const [escolherQuem, setEscolherQuem] = useState(false);
  const [lista, setLista] = useState<string[]>([]);
  const [numero, setNumero] = useState('');
  const [erroNumero, setErroNumero] = useState<string | null>(null);

  const salvar = useMutation({
    mutationFn: async ({ ligar, numeros }: Pedido) => {
      if (!config) throw new Error('Agente de IA não encontrado.');
      // ?companyId= e como o super-admin personificando chega no servidor.
      const res = await apiFetch(`/api/ai-configurations?companyId=${encodeURIComponent(companyId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: config.id,
          is_active: ligar,
          ...(numeros !== undefined ? { only_phone: numeros } : {}),
        }),
      });
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => null);
        const erro = data && typeof data === 'object' ? (data as { error?: unknown }).error : null;
        throw new Error(typeof erro === 'string' && erro ? erro : 'Não foi possível salvar. Tente de novo.');
      }
    },
    onSuccess: (_dados, { ligar, numeros }) => {
      queryClient.invalidateQueries({ queryKey: ['ai-configurations'] });
      queryClient.invalidateQueries({ queryKey: ['ai-health'] });
      setEscolherQuem(false);
      toast.success(
        !ligar
          ? 'IA desligada: só a equipe responde neste WhatsApp.'
          : numeros && numeros.length > 0
            ? numeros.length === 1
              ? `IA ligada só para ${formatarTelefone(numeros[0])}. Os outros clientes ficam com a equipe.`
              : `IA ligada só para ${numeros.length} números de teste. Os outros clientes ficam com a equipe.`
            : 'IA ligada para todos os clientes deste WhatsApp.'
      );
    },
    onError: (error) => toast.error(error.message),
  });

  if (isLoading || !config) return null;

  const ligada = config.is_active !== false;
  const numerosSalvos = numerosDoTeste(config.only_phone);
  const emTeste = numerosSalvos.length > 0;
  // Enquanto salva, mostra o estado pedido.
  const mostrada = salvar.isPending && salvar.variables ? salvar.variables.ligar : ligada;
  const id = `ia-ligada-${config.id}`;

  // Número digitado e ainda não adicionado: entra junto ao salvar (senão sumiria sem aviso).
  const digitado = soDigitos(numero);
  const digitadoEntra = digitado.length > 0 && problemaDoNumero(digitado, lista) === null;
  const listaParaSalvar = digitadoEntra ? [...lista, digitado] : lista;

  const abrirEscolha = () => {
    setLista(numerosSalvos);
    setNumero('');
    setErroNumero(null);
    setEscolherQuem(true);
  };

  const alternar = (ligar: boolean) => {
    if (ligar) abrirEscolha();
    else setConfirmarDesligar(true);
  };

  const adicionar = () => {
    if (!digitado) return;
    const problema = problemaDoNumero(digitado, lista);
    if (problema) {
      setErroNumero(problema);
      return;
    }
    setLista([...lista, digitado]);
    setNumero('');
    setErroNumero(null);
  };

  const remover = (n: string) => setLista(lista.filter((x) => x !== n));

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
                {!mostrada ? 'IA desligada' : emTeste ? 'IA atendendo só números de teste' : 'IA atendendo'}
              </Label>
              <p className="text-sm text-muted-foreground">
                {!mostrada
                  ? 'A IA não responde ninguém neste WhatsApp: só a equipe atende. As mensagens continuam chegando em Atendimentos.'
                  : emTeste
                    ? numerosSalvos.length === 1
                      ? 'A IA responde só este número. Os outros clientes ficam com a equipe.'
                      : `A IA responde só estes ${numerosSalvos.length} números. Os outros clientes ficam com a equipe.`
                    : 'A IA responde todos os clientes deste WhatsApp. Desligue se só a equipe deve responder.'}
              </p>
            </div>
            {ligada && emTeste && (
              <>
                <ListaNumeros numeros={numerosSalvos} />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" disabled={salvar.isPending} onClick={abrirEscolha}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Editar números
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={salvar.isPending}
                    onClick={() => salvar.mutate({ ligar: true, numeros: null })}
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Ligar para todos
                  </Button>
                </div>
              </>
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
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Ligar a IA para quem?</DialogTitle>
            <DialogDescription>Dá para mudar depois aqui mesmo.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Button
              className="w-full"
              variant={lista.length > 0 ? 'outline' : 'default'}
              disabled={salvar.isPending}
              onClick={() => salvar.mutate({ ligar: true, numeros: null })}
            >
              <Users className="mr-2 h-4 w-4" />
              Para todos os clientes
            </Button>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              ou
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor={`${id}-numero`}>Só para alguns números (para testar)</Label>
                <p className="text-xs text-muted-foreground">
                  A IA responde só os números da lista; os outros clientes ficam com a equipe.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <Input
                    id={`${id}-numero`}
                    value={numero}
                    onChange={(e) => {
                      setNumero(mascararTelefone(e.target.value));
                      setErroNumero(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        adicionar();
                      }
                    }}
                    placeholder="(41) 99867-9696"
                    inputMode="tel"
                    autoComplete="off"
                    aria-invalid={!!erroNumero}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    disabled={!digitado || salvar.isPending}
                    onClick={adicionar}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Adicionar
                  </Button>
                </div>
                {erroNumero ? (
                  <p className="text-xs text-destructive">{erroNumero}</p>
                ) : digitado && !numeroValido(digitado) ? (
                  <p className="text-xs text-muted-foreground">Continue digitando: DDD + número.</p>
                ) : digitado ? (
                  <p className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                    <Check className="h-3.5 w-3.5" />
                    Número completo: clique em Adicionar ou aperte Enter.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Com DDD. Ex.: (41) 99867-9696</p>
                )}
              </div>

              <div className="rounded-lg border bg-muted/30 p-3">
                {lista.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {lista.length === 1 ? '1 número na lista' : `${lista.length} números na lista`} (máximo {MAX_NUMEROS_TESTE})
                    </p>
                    <ListaNumeros numeros={lista} onRemover={remover} />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Nenhum número na lista ainda. Digite e clique em Adicionar.</p>
                )}
              </div>

              <Button
                className="w-full"
                variant={lista.length > 0 ? 'default' : 'outline'}
                disabled={listaParaSalvar.length === 0 || salvar.isPending}
                onClick={() => salvar.mutate({ ligar: true, numeros: listaParaSalvar })}
              >
                {salvar.isPending && salvar.variables?.numeros ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {listaParaSalvar.length > 1
                  ? `Ligar só para estes ${listaParaSalvar.length} números`
                  : 'Ligar só para este número'}
              </Button>
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

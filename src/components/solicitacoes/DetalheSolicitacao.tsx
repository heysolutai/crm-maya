'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { BookPlus, Loader2, Phone, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useAcoesSolicitacao, type CardSolicitacao } from '@/hooks/useSolicitacoes';
import { ORIGENS, type Etapa, type Funil } from '@/lib/solicitacoes/funis';
import { REGRA_ATENDIMENTO_PADRAO } from '@/lib/solicitacoes/regras-padrao';
import { cn } from '@/lib/utils';
import { ConhecimentoDialog } from './ConhecimentoDialog';
import { corDaCategoria, corDaEtapa } from './cores';
import { dataHora, duracao, iniciais, telefone, valorDoDado } from './formatos';
import { BotaoWhatsApp } from './BotaoWhatsApp';

interface Props {
  card: CardSolicitacao | null;
  funil: Funil;
  etapas: Etapa[];
  equipe: { id: string; name: string }[];
  isAdmin: boolean;
  onClose: () => void;
}

const SEM_RESPONSAVEL = '__ninguem__';

/** Bloco do detalhe: cartão com título. */
function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      {children}
    </section>
  );
}

/** Um fato da linha do tempo (bolinha colorida + texto). */
function ItemTempo({ cor, texto, destaque }: { cor: string; texto: string; destaque?: boolean }) {
  return (
    <li className="relative text-sm">
      <span className={cn('absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-card', cor)} />
      <span className={destaque ? 'text-amber-700 dark:text-amber-400' : undefined}>{texto}</span>
    </li>
  );
}

/** Painel de uma solicitação: etapa, responsável, valor, resumo, dados coletados e atalhos. */
export function DetalheSolicitacao({ card, funil, etapas, equipe, isAdmin, onClose }: Props) {
  const { atualizar, apagar } = useAcoesSolicitacao();
  const [resumo, setResumo] = useState('');
  const [valor, setValor] = useState('');
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const [ensinar, setEnsinar] = useState(false);

  useEffect(() => {
    setResumo(card?.summary ?? '');
    // Formato brasileiro sem milhar ("3500,5"): a leitura abaixo tira pontos e troca a vírgula.
    setValor(card?.estimatedValue != null ? card.estimatedValue.toLocaleString('pt-BR', { useGrouping: false, maximumFractionDigits: 2 }) : '');
  }, [card?.id, card?.summary, card?.estimatedValue]);

  if (!card) return null;

  const salvarCampo = async (dados: { stage?: string; assignedTo?: string | null; estimatedValue?: number | null; summary?: string | null }, ok?: string) => {
    try {
      await atualizar.mutateAsync({ id: card.id, ...dados });
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const valorNumero = valor.trim() ? Number(valor.replace(/\./g, '').replace(',', '.')) : null;
  const valorMudou = (valorNumero ?? null) !== (card.estimatedValue ?? null);
  const resumoMudou = resumo.trim() !== (card.summary ?? '').trim();
  const dados = Object.entries(card.data);
  const podeEnsinar = isAdmin && funil === 'atendimento' && card.ruleKey === REGRA_ATENDIMENTO_PADRAO;
  const nome = card.customerName || telefone(card.customerPhone) || 'Cliente';
  const cor = corDaCategoria(card.category);
  const tempoAtendimento =
    card.firstResponseAt != null
      ? Math.round((new Date(card.firstResponseAt).getTime() - new Date(card.createdAt).getTime()) / 60000)
      : null;

  return (
    <Sheet open={!!card} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="space-y-0 border-b px-6 pb-5 pt-6 text-left">
          <div className="flex items-start gap-4 pr-6">
            <span className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold', corDaEtapa(card.stage).avatar)}>
              {iniciais(nome)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <SheetTitle className="truncate text-xl">{nome}</SheetTitle>
                <BotaoWhatsApp
                  solicitacaoId={card.id}
                  conversationId={card.conversationId}
                  telefone={card.customerPhone}
                  clientId={card.clientId}
                  tamanho="md"
                  className="-my-1"
                />
              </div>
              <SheetDescription className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                {card.customerPhone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    {telefone(card.customerPhone)}
                  </span>
                )}
                <span>{dataHora(card.createdAt)}</span>
              </SheetDescription>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium', cor.pilula)}>{card.category}</span>
                <span className="text-xs text-muted-foreground">Aberta por: {ORIGENS[card.origin] ?? card.origin}</span>
              </div>
            </div>
          </div>

        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto bg-muted/20 px-6 py-5">
          <Bloco titulo="Andamento">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Etapa</Label>
              <Select value={card.stage} onValueChange={(stage) => salvarCampo({ stage }, 'Etapa atualizada.')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {etapas.map((e) => (
                    <SelectItem key={e.key} value={e.key}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select
                value={card.assignedTo?.id ?? SEM_RESPONSAVEL}
                onValueChange={(v) => salvarCampo({ assignedTo: v === SEM_RESPONSAVEL ? null : v }, 'Responsável atualizado.')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Ninguém" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_RESPONSAVEL}>Ninguém</SelectItem>
                  {equipe.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {funil === 'eventos' && (
            <div className="space-y-1.5">
              <Label htmlFor="sol-valor">Valor estimado (R$)</Label>
              <div className="flex gap-2">
                <Input
                  id="sol-valor"
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ''))}
                  placeholder="Ex.: 3500"
                />
                {valorMudou && (
                  <Button
                    variant="outline"
                    disabled={atualizar.isPending || (valorNumero != null && !Number.isFinite(valorNumero))}
                    onClick={() => salvarCampo({ estimatedValue: valorNumero }, 'Valor salvo.')}
                  >
                    Salvar
                  </Button>
                )}
              </div>
            </div>
          )}
          </Bloco>

          {podeEnsinar && (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm font-semibold">A IA não soube responder esta dúvida</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">Ensine a resposta uma vez e a IA passa a responder sozinha.</p>
              <Button size="sm" className="mt-3" onClick={() => setEnsinar(true)}>
                <BookPlus className="mr-2 h-4 w-4" />
                Adicionar à base de conhecimento
              </Button>
            </div>
          )}

          <Bloco titulo="Pedido">
            <Textarea
              id="sol-resumo"
              value={resumo}
              onChange={(e) => setResumo(e.target.value)}
              rows={3}
              maxLength={2000}
              aria-label="Resumo do pedido"
              className="text-[15px]"
            />
            {resumoMudou && (
              <div className="flex justify-end">
                <Button size="sm" variant="outline" disabled={atualizar.isPending} onClick={() => salvarCampo({ summary: resumo }, 'Resumo salvo.')}>
                  {atualizar.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  Salvar resumo
                </Button>
              </div>
            )}
          </Bloco>

          {dados.length > 0 && (
            <Bloco titulo="O que o cliente informou">
              <dl className="divide-y overflow-hidden rounded-xl border">
                {dados.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 bg-background px-3.5 py-2.5 text-sm">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-right font-semibold">{valorDoDado(v)}</dd>
                  </div>
                ))}
              </dl>
            </Bloco>
          )}

          <Bloco titulo="Linha do tempo">
            <ol className="relative space-y-3 border-l pl-5">
              <ItemTempo cor="bg-primary" texto={`Aberta em ${dataHora(card.createdAt)}`} />
              {card.notifyResult && (
                <ItemTempo cor={card.notifiedAt ? 'bg-emerald-500' : 'bg-amber-500'} texto={card.notifyResult} destaque={!card.notifiedAt} />
              )}
              {card.firstResponseAt && (
                <ItemTempo
                  cor="bg-sky-500"
                  texto={`Primeiro atendimento em ${dataHora(card.firstResponseAt)} (${duracao(tempoAtendimento)} depois)`}
                />
              )}
              {card.closedAt && <ItemTempo cor="bg-emerald-500" texto={`Concluída em ${dataHora(card.closedAt)}`} />}
            </ol>
          </Bloco>
        </div>

        {isAdmin && (
          <div className="border-t px-6 py-3">
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmarApagar(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Apagar solicitação
            </Button>
          </div>
        )}

        {ensinar && (
          <ConhecimentoDialog open={ensinar} onOpenChange={setEnsinar} solicitacaoId={card.id} pergunta={card.summary ?? ''} />
        )}

        <ConfirmDialog
          open={confirmarApagar}
          onOpenChange={setConfirmarApagar}
          title="Apagar esta solicitação?"
          description="Use só para pedidos abertos por engano: ela some do quadro e das contagens. A conversa não muda."
          confirmLabel="Apagar"
          variant="destructive"
          isLoading={apagar.isPending}
          onConfirm={async () => {
            try {
              await apagar.mutateAsync(card.id);
              toast.success('Solicitação apagada.');
              setConfirmarApagar(false);
              onClose();
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

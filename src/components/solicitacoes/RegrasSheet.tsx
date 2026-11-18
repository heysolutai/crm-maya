'use client';

import { useState } from 'react';
import {
  BellRing,
  Bot,
  ChevronRight,
  FlaskConical,
  ListChecks,
  Loader2,
  MessageCircleQuestion,
  Plus,
  Presentation,
  Tag,
  Users,
  Workflow,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { useRegrasEncaminhamento, type RegraApi } from '@/hooks/useSolicitacoes';
import { FUNIS, type Funil } from '@/lib/solicitacoes/funis';
import { cn } from '@/lib/utils';
import { AvisoEquipe } from './AvisoEquipeCard';
import { NEON_HOVER, corDaCategoria } from './cores';
import { EditorRegra } from './EditorRegra';
import { TestarRegras } from './TestarRegras';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  funil: Funil;
  restaurante: string;
}

type Aba = 'regras' | 'aviso' | 'testar';

/** Uma regra na lista: o que dispara, o que pergunta e o que acontece depois. */
function CartaoRegra({
  regra,
  onEditar,
  onAlternar,
  salvando,
}: {
  regra: RegraApi;
  onEditar: () => void;
  onAlternar: (v: boolean) => void;
  salvando: boolean;
}) {
  const cor = corDaCategoria(regra.name);
  return (
    <li className={cn('group rounded-2xl border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]', NEON_HOVER, !regra.isActive && 'opacity-60')}>
      <div className="flex items-start gap-4 p-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{regra.name}</h3>
            {regra.isSystem && (
              <Badge variant="secondary" className="font-normal">
                Automática
              </Badge>
            )}
            {!regra.isActive && (
              <Badge variant="outline" className="font-normal">
                Desligada
              </Badge>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-snug text-muted-foreground">{regra.trigger}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', cor.pilula)}>
              <Tag className="h-3 w-3" />
              {regra.tag}
            </span>
            {regra.funnel === 'eventos' && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                {regra.flowMode === 'apresentar' ? <Presentation className="h-3 w-3" /> : <ListChecks className="h-3 w-3" />}
                {regra.flowMode === 'apresentar'
                  ? `Apresenta${regra.introImages.length ? ` com ${regra.introImages.length} ${regra.introImages.length === 1 ? 'foto' : 'fotos'}` : ''} e coleta`
                  : 'Coleta direta'}
              </span>
            )}
            {!regra.isSystem && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                <MessageCircleQuestion className="h-3 w-3" />
                {regra.collectFields.length ? `Pede numa mensagem: ${regra.collectFields.join(', ')}` : 'Encaminha direto'}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
              {regra.pauseAi ? <Users className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
              {regra.pauseAi ? 'Equipe assume' : 'IA continua'}
            </span>
            {regra.notifyPhones.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                <BellRing className="h-3 w-3" />
                Avisa +{regra.notifyPhones.length}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-3">
          <Switch
            checked={regra.isActive}
            onCheckedChange={onAlternar}
            disabled={salvando}
            aria-label={regra.isActive ? `Desligar ${regra.name}` : `Ligar ${regra.name}`}
          />
          <Button variant="outline" size="sm" onClick={onEditar} className="gap-1">
            Editar
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </li>
  );
}

/** Regras e avisos do funil: quando a IA encaminha (e o que responde) e quem da equipe é avisado. */
export function RegrasSheet({ open, onOpenChange, funil, restaurante }: Props) {
  const { lista, salvar } = useRegrasEncaminhamento();
  const [aba, setAba] = useState<Aba>('regras');
  // undefined = lista; null = nova; regra = editando.
  const [editando, setEditando] = useState<RegraApi | null | undefined>(undefined);
  const regras = (lista.data ?? []).filter((r) => r.funnel === funil);
  const ativas = regras.filter((r) => r.isActive).length;

  const alternar = async (regra: RegraApi, isActive: boolean) => {
    try {
      await salvar.mutateAsync({ id: regra.id, isActive });
      toast.success(isActive ? `"${regra.name}" ligada.` : `"${regra.name}" desligada: a IA não usa mais.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setEditando(undefined);
      }}
    >
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-5xl">
        {editando !== undefined ? (
          <EditorRegra
            key={editando?.id ?? 'nova'}
            funil={funil}
            regra={editando}
            restaurante={restaurante}
            onVoltar={() => setEditando(undefined)}
            onTestar={() => {
              setEditando(undefined);
              setAba('testar');
            }}
          />
        ) : (
          <>
            <SheetHeader className="space-y-0 border-b px-6 pb-0 pt-6 text-left">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{FUNIS[funil].label}</p>
              <SheetTitle className="text-xl">Regras e avisos</SheetTitle>
              <SheetDescription className="text-sm">
                Quando a IA passa o cliente para a equipe, o que ela responde e quem da equipe é avisado. Vale para todos os WhatsApp do restaurante.
              </SheetDescription>
              <div role="tablist" className="-mb-px flex gap-6 pt-5">
                {(
                  [
                    { v: 'regras', rotulo: 'Quando encaminhar', Icone: Workflow },
                    { v: 'aviso', rotulo: 'Aviso à equipe', Icone: BellRing },
                    { v: 'testar', rotulo: 'Testar a IA', Icone: FlaskConical },
                  ] as const
                ).map(({ v, rotulo, Icone }) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={aba === v}
                    onClick={() => setAba(v)}
                    className={cn(
                      'inline-flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold transition-colors',
                      aba === v ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Icone className="h-4 w-4" />
                    {rotulo}
                  </button>
                ))}
              </div>
            </SheetHeader>

            {aba === 'aviso' ? (
              <AvisoEquipe funil={funil} />
            ) : aba === 'testar' ? (
              <TestarRegras funil={funil} />
            ) : (
              <div className="flex-1 overflow-y-auto bg-muted/20 px-6 py-6">
                {lista.isLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="mx-auto max-w-3xl">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <ListChecks className="h-4 w-4" />
                        {ativas === 1 ? '1 regra ligada' : `${ativas} regras ligadas`} · clique em Editar para ver os passos
                      </div>
                      <Button onClick={() => setEditando(null)}>
                        <Plus className="mr-1.5 h-4 w-4" />
                        {funil === 'eventos' ? 'Novo tipo de evento' : 'Nova categoria'}
                      </Button>
                    </div>

                    <ul className="space-y-3">
                      {regras.map((r) => (
                        <CartaoRegra key={r.id} regra={r} onEditar={() => setEditando(r)} onAlternar={(v) => alternar(r, v)} salvando={salvar.isPending} />
                      ))}
                    </ul>

                    <p className="mt-5 text-center text-xs text-muted-foreground">
                      {funil === 'eventos'
                        ? 'Vale quando "Encaminhar eventos personalizados" está ligado em Conexões › Agente de IA › Ferramentas.'
                        : 'Vale quando "Transferir para um atendente" está ligado em Conexões › Agente de IA › Ferramentas.'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

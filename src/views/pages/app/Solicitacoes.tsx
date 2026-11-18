'use client';

import { useEffect, useMemo, useState, type ElementType, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ptBR } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import {
  CalendarDays,
  CalendarPlus,
  Columns3,
  Handshake,
  Headset,
  Hourglass,
  Kanban,
  List,
  ListOrdered,
  Loader2,
  PartyPopper,
  Plus,
  Search,
  Settings2,
  Timer,
  Trophy,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/hooks/useAuth';
import { useAcoesSolicitacao, useQuadroSolicitacoes, type PeriodoCRM, type ResumoSolicitacoes } from '@/hooks/useSolicitacoes';
import { FUNIS, FUNIS_VALIDOS, ehFunil, type Funil } from '@/lib/solicitacoes/funis';
import { cn } from '@/lib/utils';
import { DetalheSolicitacao } from '@/components/solicitacoes/DetalheSolicitacao';
import { ListaSolicitacoes } from '@/components/solicitacoes/ListaSolicitacoes';
import { NovaSolicitacaoDialog } from '@/components/solicitacoes/NovaSolicitacaoDialog';
import { QuadroKanban } from '@/components/solicitacoes/QuadroKanban';
import { RegrasSheet } from '@/components/solicitacoes/RegrasSheet';
import { TONS, type NomeTom } from '@/components/solicitacoes/cores';
import { duracao, emReais } from '@/components/solicitacoes/formatos';

type Visao = 'quadro' | 'lista';
const CHAVE_VISAO = 'crm-visao';

const ICONE_FUNIL: Record<Funil, ElementType> = { eventos: PartyPopper, atendimento: Headset };

const ATALHOS = [7, 14, 30, 60] as const;
type Atalho = (typeof ATALHOS)[number] | 'personalizado';

/** Dia de São Paulo (AAAA-MM-DD). */
function diaSP(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function ultimosDias(n: number): PeriodoCRM {
  const hoje = new Date();
  const inicio = new Date(hoje.getTime() - (n - 1) * 24 * 60 * 60 * 1000);
  return { desde: diaSP(inicio), ate: diaSP(hoje) };
}

/** "2026-11-01" -> "01/11" */
function curto(dia: string): string {
  const [, m, d] = dia.split('-');
  return `${d}/${m}`;
}

/** Card de número do período: véu bem suave do seu tom + contorno neon da mesma cor. */
function Numero({
  tom,
  icone: Icone,
  rotulo,
  valor,
  detalhe,
}: {
  tom: NomeTom;
  icone: ElementType;
  rotulo: string;
  valor: string;
  detalhe?: string;
}) {
  const t = TONS[tom];
  return (
    <div className={cn('min-w-0 rounded-2xl border bg-card p-4 sm:p-5', t.cartao)}>
      <div className="flex items-center gap-2.5">
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', t.icone)}>
          <Icone className="h-[18px] w-[18px]" />
        </span>
        <p className="min-w-0 text-[13.5px] font-semibold leading-tight text-foreground/80">{rotulo}</p>
      </div>
      <p className="mt-3 truncate text-[28px] font-bold leading-none tracking-tight tabular-nums sm:text-[30px]">{valor}</p>
      {detalhe && <p className="mt-2 truncate text-[13px] text-muted-foreground">{detalhe}</p>}
    </div>
  );
}

function ResumoDoPeriodo({ funil, resumo }: { funil: Funil; resumo: ResumoSolicitacoes }) {
  if (funil === 'eventos') {
    return (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {/* Na ordem do funil: entra, negocia, fecha. */}
        <Numero tom="azul" icone={CalendarPlus} rotulo="Pedidos no período" valor={String(resumo.noMes)} detalhe="eventos personalizados" />
        <Numero
          tom="ambar"
          icone={Handshake}
          rotulo="Em negociação"
          valor={resumo.valorEmAberto ? emReais(resumo.valorEmAberto) : 'R$ 0'}
          detalhe={`${resumo.abertasAgora} ${resumo.abertasAgora === 1 ? 'pedido em aberto' : 'pedidos em aberto'}`}
        />
        <Numero
          tom="verde"
          icone={Trophy}
          rotulo="Fechados"
          valor={String(resumo.fechadosNoMes)}
          detalhe={resumo.valorFechadoNoMes ? emReais(resumo.valorFechadoNoMes) : 'nenhum valor fechado'}
        />
        <Numero tom="violeta" icone={Timer} rotulo="Tempo até o 1º contato" valor={duracao(resumo.tempoMedioAtendimentoMin)} detalhe="média do período" />
      </div>
    );
  }
  const principais = resumo.porCategoria.slice(0, 3);
  const maior = Math.max(1, ...principais.map((p) => p.total));
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <Numero tom="azul" icone={Headset} rotulo="Encaminhamentos" valor={String(resumo.noMes)} detalhe="passados pela IA no período" />
      <Numero tom="ambar" icone={Hourglass} rotulo="Abertos" valor={String(resumo.abertasAgora)} detalhe="aguardando ou em atendimento" />
      <Numero tom="violeta" icone={Timer} rotulo="Tempo até atender" valor={duracao(resumo.tempoMedioAtendimentoMin)} detalhe="média do período" />
      <div className={cn('col-span-2 min-w-0 rounded-2xl border bg-card p-4 sm:p-5 xl:col-span-1', TONS.verde.cartao)}>
        <div className="flex items-center gap-2.5">
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', TONS.verde.icone)}>
            <ListOrdered className="h-[18px] w-[18px]" />
          </span>
          <p className="text-[13.5px] font-semibold leading-tight text-foreground/80">Principais motivos</p>
        </div>
        {principais.length ? (
          <ul className="mt-3 space-y-2">
            {principais.map((c) => (
              <li key={c.categoria}>
                <div className="flex justify-between gap-2 text-[13px]">
                  <span className="truncate">{c.categoria}</span>
                  <span className="font-semibold tabular-nums">{c.total}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn('h-full rounded-full', TONS.verde.barra)} style={{ width: `${(c.total / maior) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[13px] text-muted-foreground">Nenhum encaminhamento no período.</p>
        )}
      </div>
    </div>
  );
}

/** Segmentado (abas, período, visão): fundo neutro, item ativo em cartão branco. */
function Segmento({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 items-center gap-0.5 rounded-xl bg-muted p-1">
      {children}
    </div>
  );
}

function ItemSegmento({ ativo, onClick, children, title }: { ativo: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        ativo ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

/**
 * CRM do restaurante (Solicitações): o que foge da reserva normal (eventos
 * personalizados, grupos maiores) e o que a IA passou para a equipe
 * (atendimento humano), cada um num funil. Reservas ficam no Reserve Maya.
 */
export default function Solicitacoes() {
  const router = useRouter();
  const params = useSearchParams();
  const { role, isSuperAdmin } = useAuth();
  const isAdmin = isSuperAdmin || role === 'company_admin';

  const funilDaUrl = params.get('funil');
  const [funil, setFunil] = useState<Funil>(ehFunil(funilDaUrl) ? funilDaUrl : 'eventos');
  const [visao, setVisao] = useState<Visao>('quadro');
  const [atalho, setAtalho] = useState<Atalho>(30);
  const [periodo, setPeriodo] = useState<PeriodoCRM>(() => ultimosDias(30));
  const [faixa, setFaixa] = useState<DateRange | undefined>();
  const [calendarioAberto, setCalendarioAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  // Link do aviso no WhatsApp (?abrir=<id>) abre o card; o da aba Ferramentas (?regras=1), as regras.
  const [abertoId, setAbertoId] = useState<string | null>(params.get('abrir'));
  const [regrasAbertas, setRegrasAbertas] = useState(params.get('regras') === '1');
  const [novaAberta, setNovaAberta] = useState(false);

  // Quadro ou lista: lembra a escolha de quem usa (só neste navegador).
  useEffect(() => {
    try {
      const salva = window.localStorage.getItem(CHAVE_VISAO);
      if (salva === 'lista' || salva === 'quadro') setVisao(salva);
    } catch {
      /* sem armazenamento: fica no quadro */
    }
  }, []);
  const trocarVisao = (v: Visao) => {
    setVisao(v);
    try {
      window.localStorage.setItem(CHAVE_VISAO, v);
    } catch {
      /* ignora */
    }
  };

  // Busca espera a pessoa parar de digitar.
  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca), 350);
    return () => clearTimeout(t);
  }, [busca]);

  const { data, isLoading, isError, isFetching } = useQuadroSolicitacoes(funil, buscaAplicada, periodo);
  const { atualizar } = useAcoesSolicitacao();
  const aberto = useMemo(() => data?.itens.find((i) => i.id === abertoId) ?? null, [data, abertoId]);

  const escolherAtalho = (n: (typeof ATALHOS)[number]) => {
    setAtalho(n);
    setPeriodo(ultimosDias(n));
  };

  const aplicarFaixa = (r: DateRange | undefined) => {
    setFaixa(r);
    if (r?.from && r?.to) {
      setPeriodo({ desde: diaSP(r.from), ate: diaSP(r.to) });
      setAtalho('personalizado');
      setCalendarioAberto(false);
    }
  };

  const trocarFunil = (f: Funil) => {
    setFunil(f);
    setAbertoId(null);
    router.replace(`/app/crm?funil=${f}`, { scroll: false });
  };

  const mover = (id: string, stage: string) => {
    const etapa = data?.etapas.find((e) => e.key === stage);
    atualizar.mutate(
      { id, stage },
      {
        onSuccess: () => toast.success(`Movida para "${etapa?.label ?? stage}".`),
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
            <Kanban className="h-7 w-7 shrink-0 text-primary" />
            CRM
          </h1>
          <p className="mt-1 text-[15px] text-muted-foreground">{FUNIS[funil].descricao}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={() => setRegrasAbertas(true)}>
              <Settings2 className="mr-2 h-4 w-4" />
              Regras e avisos
            </Button>
          )}
          <Button onClick={() => setNovaAberta(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova solicitação
          </Button>
        </div>
      </div>

      {/* Funil */}
      <div role="tablist" aria-label="Funil" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 sm:inline-flex">
        {FUNIS_VALIDOS.map((f) => {
          const ativo = funil === f;
          const Icone = ICONE_FUNIL[f];
          return (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={ativo}
              onClick={() => trocarFunil(f)}
              className={cn(
                'inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                ativo ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icone className={cn('h-4 w-4', ativo && 'text-primary')} />
              {FUNIS[f].label}
            </button>
          );
        })}
      </div>

      {/* Período, busca e visão */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Segmento label="Período">
            {ATALHOS.map((n) => (
              <ItemSegmento key={n} ativo={atalho === n} onClick={() => escolherAtalho(n)} title={`Últimos ${n} dias`}>
                {n} dias
              </ItemSegmento>
            ))}
            <Popover open={calendarioAberto} onOpenChange={setCalendarioAberto}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-pressed={atalho === 'personalizado'}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                    atalho === 'personalizado' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <CalendarDays className="h-4 w-4" />
                  {atalho === 'personalizado' ? `${curto(periodo.desde)} – ${curto(periodo.ate)}` : 'Personalizado'}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                  mode="range"
                  selected={faixa}
                  onSelect={aplicarFaixa}
                  numberOfMonths={2}
                  locale={ptBR}
                  disabled={{ after: new Date() }}
                  initialFocus
                />
                <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">Escolha o primeiro e o último dia.</p>
              </PopoverContent>
            </Popover>
          </Segmento>
          {isFetching && !isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Atualizando" />}
        </div>

        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1 xl:w-80 xl:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, telefone ou assunto"
              className="h-10 pl-9"
              aria-label="Buscar solicitações"
            />
          </div>
          <Segmento label="Visualização">
            <ItemSegmento ativo={visao === 'quadro'} onClick={() => trocarVisao('quadro')} title="Ver em quadro">
              <Columns3 className="h-4 w-4" />
              <span className="hidden sm:inline">Quadro</span>
            </ItemSegmento>
            <ItemSegmento ativo={visao === 'lista'} onClick={() => trocarVisao('lista')} title="Ver em lista">
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">Lista</span>
            </ItemSegmento>
          </Segmento>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError || !data ? (
        <div className="rounded-2xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          Não foi possível carregar o CRM. Tente atualizar a página.
        </div>
      ) : (
        <>
          <ResumoDoPeriodo funil={funil} resumo={data.resumo} />
          {visao === 'quadro' ? (
            <QuadroKanban funil={funil} etapas={data.etapas} itens={data.itens} onAbrir={setAbertoId} onMover={mover} />
          ) : (
            <ListaSolicitacoes funil={funil} etapas={data.etapas} itens={data.itens} onAbrir={setAbertoId} />
          )}
          {data.itens.length === 0 && !buscaAplicada && visao === 'quadro' && (
            <p className="text-center text-sm text-muted-foreground">
              {funil === 'eventos'
                ? 'Nenhum pedido neste período. Quando um cliente pedir um evento personalizado, a IA coleta os dados e o pedido aparece aqui.'
                : 'Nenhum encaminhamento neste período. Quando a IA passar uma conversa para a equipe, o motivo aparece aqui.'}
            </p>
          )}
        </>
      )}

      <DetalheSolicitacao
        card={aberto}
        funil={funil}
        etapas={data?.etapas ?? []}
        equipe={data?.equipe ?? []}
        isAdmin={isAdmin}
        onClose={() => setAbertoId(null)}
      />
      {isAdmin && <RegrasSheet open={regrasAbertas} onOpenChange={setRegrasAbertas} funil={funil} restaurante="Seu Restaurante" />}
      <NovaSolicitacaoDialog open={novaAberta} onOpenChange={setNovaAberta} funil={funil} />
    </div>
  );
}

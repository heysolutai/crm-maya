import { memo, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Phone,
  Bot,
  Loader2,
  ArrowLeft,
  MoreVertical,
  StickyNote,
  RefreshCw,
  X,
  Tag,
  MessageCircle,
  Pencil,
  ChevronDown,
  PauseCircle,
  Play,
  Timer,
  Infinity as InfinityIcon,
  Copy,
  Hash,
  Workflow,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { createWhatsAppLink } from '@/lib/linkify';
import { cn } from '@/lib/utils';
import { statusColors, statusLabels, type Conversation, type ConversationStatus, type TeamMember } from './types';
import {
  OPCOES_PAUSA,
  formatarDuracao,
  formatarHorario,
  isAiPausedNow,
  minutosRestantes,
  rotuloQuemPausou,
} from './ai-pause';

/**
 * Relogio da contagem regressiva. So tica com pausa COM prazo (30s basta pra
 * "volta em X min"); zera quando o prazo muda pra nao mostrar 1 min a mais.
 */
function useAgora(ativo: boolean, chave: string | null | undefined): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    setAgora(Date.now());
    if (!ativo) return;
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [ativo, chave]);
  return agora;
}

/** So https vira link: a URL vem do n8n e um `javascript:` aqui seria XSS. */
function urlExecucaoSegura(url: string | null | undefined): string | null {
  return url && /^https:\/\//i.test(url) ? url : null;
}

async function copiar(texto: string, rotulo: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(`${rotulo} copiado`);
  } catch {
    // clipboard bloqueado (http sem tls, permissao negada)
    toast.error(`Não foi possível copiar o ${rotulo.toLowerCase()}`);
  }
}

interface ConversationHeaderProps {
  conversation: Conversation;
  isChangingAIPause: boolean;
  /** Tempo padrao da empresa em minutos (0 = sem prazo). null = ainda nao carregou. */
  aiPauseDefaultMinutes?: number | null;
  /** undefined = tempo padrao da empresa; null = ate retomar; numero = minutos. */
  onPauseAI: (minutes?: number | null) => void;
  onResumeAI: () => void;
  /** Pra dizer QUEM pausou (ai_paused_by guarda o id). */
  teamMembers?: TeamMember[];
  onOpenNotes: () => void;
  onTransfer: () => void;
  onClose: () => void;
  onReopen: () => void;
  onOpenTagManager: () => void;
  onRemoveTag: (tag: string) => void;
  onEditContact: () => void;
  onBack?: () => void;
  /** Abre a gaveta "Dados do contato" (so abaixo de lg; no desktop o painel e fixo). */
  onOpenInfo?: () => void;
}

export const ConversationHeader = memo(function ConversationHeader({
  conversation,
  isChangingAIPause,
  aiPauseDefaultMinutes = null,
  onPauseAI,
  onResumeAI,
  teamMembers = [],
  onOpenNotes,
  onTransfer,
  onClose,
  onReopen,
  onOpenTagManager,
  onRemoveTag,
  onEditContact,
  onBack,
  onOpenInfo,
}: ConversationHeaderProps) {
  const abrirInfo = () => {
    // No desktop a barra lateral ja mostra tudo; o toque no nome so vale
    // abaixo de lg, onde o painel vira gaveta.
    if (!onOpenInfo || window.matchMedia('(min-width: 1024px)').matches) return;
    onOpenInfo();
  };

  const clientName = conversation.client 
    ? `${conversation.client.first_name} ${conversation.client.last_name || ''}`.trim()
    : 'Cliente';

  const initials = clientName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  // ── Pausa da IA ──
  const cliente = conversation.client;
  const prazoPausa = cliente?.ai_paused ? cliente.ai_paused_until ?? null : null;
  const agora = useAgora(!!prazoPausa, prazoPausa);
  const iaPausada = isAiPausedNow(cliente, agora);
  const restante = iaPausada && prazoPausa ? formatarDuracao(Math.max(1, minutosRestantes(prazoPausa, agora))) : null;
  /** "volta em 12 min" / "até retomar" */
  const textoPausa = restante ? `volta em ${restante}` : 'até retomar';
  const quemPausou = iaPausada ? rotuloQuemPausou(cliente?.ai_paused_by, teamMembers) : null;
  const detalhePausa = iaPausada
    ? [
        prazoPausa ? `IA pausada até ${formatarHorario(prazoPausa, agora)}` : 'IA pausada até alguém retomar',
        quemPausou ? `(pausada ${quemPausou})` : null,
      ]
        .filter(Boolean)
        .join(' ')
    : '';
  // "Pausar pelo tempo padrao" so quando o padrao tem prazo e nao repete 15/60.
  const padraoExtra =
    aiPauseDefaultMinutes && aiPauseDefaultMinutes > 0 && !OPCOES_PAUSA.some((o) => o.minutes === aiPauseDefaultMinutes)
      ? aiPauseDefaultMinutes
      : null;

  // ── Depuracao (n8n) ──
  const urlExecucao = urlExecucaoSegura(conversation.execution_url);
  const telefone = cliente?.phone?.trim() || null;

  const itensMenuPausa = (
    <>
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
        {iaPausada ? `IA pausada · ${textoPausa}` : 'A IA para de responder este cliente'}
      </DropdownMenuLabel>
      {iaPausada && (
        <>
          <DropdownMenuItem onClick={onResumeAI} className="font-medium text-emerald-700 dark:text-emerald-400">
            <Play className="h-4 w-4 mr-2" />
            Retomar IA agora
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Alterar pausa</DropdownMenuLabel>
        </>
      )}
      {OPCOES_PAUSA.map((op) => (
        <DropdownMenuItem key={op.label} onClick={() => onPauseAI(op.minutes)}>
          <Timer className="h-4 w-4 mr-2" />
          {op.label}
        </DropdownMenuItem>
      ))}
      {padraoExtra && (
        <DropdownMenuItem onClick={() => onPauseAI(undefined)}>
          <Timer className="h-4 w-4 mr-2" />
          Pausar pelo tempo padrão ({formatarDuracao(padraoExtra)})
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onClick={() => onPauseAI(null)}>
        <InfinityIcon className="h-4 w-4 mr-2" />
        Pausar até eu retomar
      </DropdownMenuItem>
    </>
  );

  return (
    <div className="border-b border-border bg-card">
      {/* Main header bar - WhatsApp style */}
      <div className="flex items-center gap-2 px-2 py-2 md:px-4 md:py-3">
        {/* Back button (mobile only) */}
        {onBack && (
          <Button variant="ghost" size="icon" className="md:hidden shrink-0 h-9 w-9" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}

        {/* Avatar com popover de contato */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              aria-label="Ver contato do cliente"
            >
              <Avatar className="h-10 w-10 cursor-pointer transition-opacity hover:opacity-80">
                <AvatarFallback className="bg-primary/20 text-primary text-sm font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-3">
            <div className="space-y-2">
              <p className="text-sm font-semibold truncate">{clientName}</p>
              {conversation.client?.phone ? (
                <>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{conversation.client.phone}</span>
                  </div>
                  <Button
                    size="sm"
                    className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() =>
                      window.open(createWhatsAppLink(conversation.client!.phone!), '_blank', 'noopener,noreferrer')
                    }
                  >
                    <MessageCircle className="h-4 w-4" />
                    Abrir no WhatsApp
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Sem telefone cadastrado</p>
              )}
              {conversation.client?.id && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-2"
                  onClick={onEditContact}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar contato
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Name + status */}
        <div
          className="flex-1 min-w-0 max-lg:cursor-pointer max-lg:min-h-10"
          role={onOpenInfo ? 'button' : undefined}
          tabIndex={onOpenInfo ? 0 : undefined}
          aria-label={onOpenInfo ? 'Ver dados do contato' : undefined}
          onClick={abrirInfo}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              abrirInfo();
            }
          }}
        >
          <h2 className="text-base font-semibold truncate">{clientName}</h2>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge
              variant="outline"
              className={`${statusColors[conversation.status as ConversationStatus]} text-white border-0 text-[10px] px-1.5 py-0 h-4`}
            >
              {statusLabels[conversation.status as ConversationStatus]}
            </Badge>
            {(conversation as any).agent && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/20"
                title={`Recebido por ${(conversation as any).agent.display_name}`}
              >
                {(conversation as any).agent.display_name}
              </Badge>
            )}
            <span className="text-[11px] text-muted-foreground truncate">
              {conversation.started_at
                ? (() => { try { const d = new Date(conversation.started_at); return isNaN(d.getTime()) ? '' : format(d, "dd/MM/yyyy HH:mm", { locale: ptBR }); } catch { return ''; } })()
                : ''}
            </span>
          </div>
        </div>

        {/* Execucao no n8n (desktop). No celular fica dentro do menu. */}
        {urlExecucao && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="icon" className="hidden md:inline-flex shrink-0 h-9 w-9">
                <a
                  href={urlExecucao}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Abrir execução no n8n"
                >
                  <Workflow className="h-4 w-4" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Abrir execução no n8n</TooltipContent>
          </Tooltip>
        )}

        {/* Pausa da IA: estado sempre visivel + menu com os prazos. */}
        {cliente?.id && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isChangingAIPause}
                  title={iaPausada ? detalhePausa : 'Pausar a IA nesta conversa'}
                  aria-label={iaPausada ? `${detalhePausa}. Alterar pausa` : 'Pausar IA'}
                  className={cn(
                    'shrink-0 h-9 md:h-8 px-2 text-xs gap-1',
                    iaPausada
                      ? 'bg-orange-500/15 text-orange-700 hover:bg-orange-500/25 hover:text-orange-800 dark:text-orange-300 font-semibold'
                      : 'border border-border text-muted-foreground'
                  )}
                >
                  {isChangingAIPause ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : iaPausada ? (
                    <PauseCircle className="h-4 w-4 md:h-3.5 md:w-3.5" />
                  ) : (
                    <Bot className="h-4 w-4 md:h-3.5 md:w-3.5" />
                  )}
                  {iaPausada ? (
                    // Abaixo de lg (celular, ou tablet com a lista aberta ao
                    // lado) nao cabe: o texto vai na faixa logo abaixo.
                    <span className="hidden lg:inline whitespace-nowrap">IA pausada · {textoPausa}</span>
                  ) : (
                    <>
                      <span className="sm:hidden">Pausar</span>
                      <span className="hidden sm:inline">Pausar IA</span>
                    </>
                  )}
                  <ChevronDown className="hidden sm:block h-3 w-3 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                {itensMenuPausa}
              </DropdownMenuContent>
            </DropdownMenu>

            {iaPausada && (
              <Button
                size="sm"
                onClick={onResumeAI}
                disabled={isChangingAIPause}
                className="hidden lg:inline-flex shrink-0 h-8 px-3 text-xs gap-1 bg-orange-600 hover:bg-orange-700 text-white"
              >
                <Play className="h-3.5 w-3.5" />
                Retomar IA
              </Button>
            )}
          </>
        )}

        {/* 3-dot menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9" aria-label="Mais ações">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={onOpenNotes}>
              <StickyNote className="h-4 w-4 mr-2" />
              Notas & Lembretes
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenTagManager}>
              <Tag className="h-4 w-4 mr-2" />
              Etiquetas
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* Depuracao: o que se cola na busca de execucoes do n8n. */}
            {urlExecucao && (
              <DropdownMenuItem asChild className="md:hidden">
                <a href={urlExecucao} target="_blank" rel="noopener noreferrer">
                  <Workflow className="h-4 w-4 mr-2" />
                  Abrir execução no n8n
                </a>
              </DropdownMenuItem>
            )}
            {telefone && (
              <DropdownMenuItem onClick={() => copiar(telefone, 'Telefone')}>
                <Copy className="h-4 w-4 mr-2" />
                Copiar telefone
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => copiar(conversation.id, 'ID da conversa')}>
              <Hash className="h-4 w-4 mr-2" />
              Copiar ID da conversa
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onTransfer}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Transferir
            </DropdownMenuItem>
            {conversation.status === 'closed' ? (
              <DropdownMenuItem onClick={onReopen}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reabrir
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={onClose} className="text-destructive focus:text-destructive">
                <X className="h-4 w-4 mr-2" />
                Encerrar
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Faixa de pausa abaixo de lg: no cabecalho estreito so cabe o icone,
          entao o estado e o "Retomar" ficam aqui, impossiveis de nao ver. */}
      {cliente?.id && iaPausada && (
        <div
          className="lg:hidden flex items-center gap-2 px-3 py-1.5 border-t border-orange-500/30 bg-orange-500/10 text-orange-800 dark:text-orange-300"
          role="status"
        >
          <PauseCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1 min-w-0 text-xs font-medium truncate" title={detalhePausa}>
            IA pausada · {textoPausa}
            {quemPausou && <span className="font-normal opacity-80"> · {quemPausou}</span>}
          </span>
          <Button
            size="sm"
            onClick={onResumeAI}
            disabled={isChangingAIPause}
            className="shrink-0 h-8 px-3 text-xs gap-1 bg-orange-600 hover:bg-orange-700 text-white"
          >
            {isChangingAIPause ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Retomar IA
          </Button>
        </div>
      )}

      {/* Tags row - only show if there are tags */}
      {conversation.tags && conversation.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2 md:px-4">
          {conversation.tags.map((tag, idx) => (
            <Badge key={idx} variant="secondary" className="gap-1 text-[11px] h-5 px-2">
              {tag}
              <button
                onClick={() => onRemoveTag(tag)}
                className="ml-0.5 hover:text-destructive"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
});
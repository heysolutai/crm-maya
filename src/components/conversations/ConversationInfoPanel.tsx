'use client';

import { memo, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Mail,
  Phone,
  MessageCircle,
  Copy,
  Check,
  Plus,
  Bot,
  UserPlus,
  Pencil,
  ArrowRightLeft,
  Trash2,
  Loader2,
  StickyNote,
  ExternalLink,
  PauseCircle,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useContactAttributes } from '@/hooks/useContactAttributes';
import { useClientNotes } from '@/hooks/useClientNotes';
import { ContactAttributeDialog } from './dialogs/ContactAttributeDialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { tagColor } from './tag-catalog';
import { formatarHorario, isAiPausedNow, rotuloQuemPausou } from './ai-pause';
import { ExecutionLogs } from './ExecutionLogs';
import type { Conversation, TeamMember } from './types';

interface Departamento {
  id: string;
  name: string;
  color?: string | null;
}

const STORAGE_KEY = 'conversation_info_panel_open';
const COR_PADRAO = '#6b7280';

/**
 * Regra de toque: abaixo de lg (1024px) o painel vira gaveta de celular/tablet,
 * onde nao existe hover. Ali todo alvo tem >= 40px e os controles que no
 * desktop so aparecem no hover ficam sempre visiveis.
 */
const SO_NO_HOVER = 'lg:opacity-0 lg:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity';
const ALVO_TOQUE = 'max-lg:h-10 max-lg:w-10 inline-flex items-center justify-center';

export interface ConversationInfoBodyProps {
  conversation: Conversation;
  onOpenTagManager?: () => void;
  onAssignToMe?: () => void;
  onTransfer?: () => void;
  onEditContact?: () => void;
  /** Equipe elegivel pra assumir a conversa. */
  teamMembers?: TeamMember[];
  departments?: Departamento[];
  /** Transfere pro atendente escolhido no select. */
  onSelectAgent?: (userId: string) => void;
  /** Move a conversa pro departamento escolhido. */
  onSelectDepartment?: (departmentId: string) => void;
  /**
   * Sem permissao de edicao no CRM, atributos e notas ficam so pra leitura —
   * o painel continua util pra consulta.
   */
  podeEditarContato?: boolean;
}

/** Linha de dado do contato, com botao de copiar quando ha valor. */
function ContactRow({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Mail;
  value?: string | null;
  label: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const vazio = !value || !value.trim();

  const copiar = async () => {
    if (vazio) return;
    try {
      await navigator.clipboard.writeText(value!);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // clipboard bloqueado (http sem tls, permissao negada) — ignora
    }
  };

  return (
    <div className="flex items-center gap-2 group min-w-0 min-h-6">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-label={label} />
      <span
        className={cn(
          'text-[13px] truncate flex-1',
          vazio ? 'text-muted-foreground/60 italic' : 'text-foreground'
        )}
      >
        {vazio ? 'Indisponível' : value}
      </span>
      {!vazio && (
        <button
          onClick={copiar}
          className={cn(
            'shrink-0 text-muted-foreground hover:text-foreground max-lg:-mr-2',
            SO_NO_HOVER,
            ALVO_TOQUE
          )}
          aria-label={`Copiar ${label.toLowerCase()}`}
          title="Copiar"
        >
          {copiado ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}

/** Card com titulo e conteudo recolhivel. */
function Secao({
  titulo,
  aberta,
  onToggle,
  children,
}: {
  titulo: string;
  aberta: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={aberta}
        className="w-full flex items-center justify-between px-3 h-10 hover:bg-accent/40 transition-colors"
      >
        <span className="text-[13px] font-medium">{titulo}</span>
        <ChevronDown
          className={cn('h-4 w-4 text-muted-foreground transition-transform', !aberta && '-rotate-90')}
        />
      </button>
      {aberta && <div className="px-3 pb-3 pt-1 space-y-3">{children}</div>}
    </div>
  );
}

/** Rotulo + valor, empilhados. */
function Campo({
  label,
  acao,
  children,
}: {
  label: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 min-h-5">
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        {acao}
      </div>
      {children}
    </div>
  );
}

function Bolinha({ cor }: { cor?: string | null }) {
  return (
    <span
      className="h-2.5 w-2.5 rounded-full shrink-0"
      style={{ backgroundColor: cor || COR_PADRAO }}
    />
  );
}

/** Badge da etiqueta com a cor do catalogo: fundo ~12%, borda ~35%, bolinha cheia. */
function EtiquetaBadge({ nome }: { nome: string }) {
  const cor = tagColor(nome);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 h-5 text-[11px] font-medium text-foreground max-w-full"
      style={{
        backgroundColor: `color-mix(in srgb, ${cor} 12%, transparent)`,
        borderColor: `color-mix(in srgb, ${cor} 35%, transparent)`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: cor }} />
      <span className="truncate">{nome}</span>
    </span>
  );
}

/**
 * Conteudo do painel de informacoes. O MESMO corpo e usado na barra lateral
 * (desktop) e na gaveta (celular/tablet).
 *
 * Bloco de contato no topo (avatar, nome, dados, acoes) e cards recolhiveis
 * abaixo. Atributos e notas sao do CONTATO, nao da conversa: valem para todas
 * as conversas dele, inclusive por outro numero.
 *
 * O componente NAO remonta ao trocar de conversa — por isso os efeitos que
 * limpam estado quando o contato muda.
 */
export function ConversationInfoBody({
  conversation,
  onOpenTagManager,
  onAssignToMe,
  onTransfer,
  onEditContact,
  teamMembers = [],
  departments = [],
  onSelectAgent,
  onSelectDepartment,
  podeEditarContato = true,
}: ConversationInfoBodyProps) {
  const [secoes, setSecoes] = useState({ acoes: true, conversa: true, atributos: true, notas: true, logs: true });
  const alternarSecao = (k: keyof typeof secoes) => setSecoes((s) => ({ ...s, [k]: !s[k] }));

  const cliente = conversation.client;
  const clientId = cliente?.id ?? null;

  const { atributos, isLoading: carregandoAtributos, definir, remover, isSaving } =
    useContactAttributes(clientId);
  const { notes, loading: carregandoNotas, addNote, deleteNote } = useClientNotes(clientId);

  const [dialogAtributo, setDialogAtributo] = useState<{ aberto: boolean; atributo: { chave: string; valor: string } | null }>({
    aberto: false,
    atributo: null,
  });
  const [novaNota, setNovaNota] = useState('');
  const [salvandoNota, setSalvandoNota] = useState(false);

  // Sem limpar aqui, um rascunho de nota digitado num contato seria salvo no
  // proximo — e o dialog abriria com o atributo do contato anterior.
  useEffect(() => {
    setNovaNota('');
    setDialogAtributo({ aberto: false, atributo: null });
  }, [clientId]);

  const enviarNota = async () => {
    const texto = novaNota.trim();
    if (!texto || salvandoNota) return;
    setSalvandoNota(true);
    try {
      const ok = await addNote(texto);
      if (ok) setNovaNota('');
    } finally {
      setSalvandoNota(false);
    }
  };

  /**
   * Estado da espera do fluxo externo.
   *
   * O `resume_url` some assim que o CRM o consome (uso unico), mas o prazo
   * fica — e e o prazo que diz se o fluxo ainda pode voltar. Por isso os dois
   * sao lidos juntos: sem url e dentro do prazo significa "ja encaminhei, o
   * n8n esta processando", que e diferente de "ninguem esta esperando".
   */
  const esperaDoFluxo = (() => {
    const prazo = conversation.resume_url_expires_at
      ? new Date(conversation.resume_url_expires_at)
      : null;
    if (!prazo || Number.isNaN(prazo.getTime())) return null;

    const vencida = prazo < new Date();
    const quando = prazo.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    if (vencida) return { ativa: false, rotulo: `Vencida em ${quando}` };
    if (conversation.resume_url) return { ativa: true, rotulo: `Aguardando resposta até ${quando}` };
    return { ativa: true, rotulo: `Encaminhada ao fluxo · janela até ${quando}` };
  })();

  // Pausa da IA: quem pausou e ate quando. A contagem ao vivo fica no
  // cabecalho; aqui vale o horario absoluto.
  const agora = Date.now();
  const iaPausada = isAiPausedNow(cliente, agora);
  const quemPausou = iaPausada ? rotuloQuemPausou(cliente?.ai_paused_by, teamMembers) : null;
  const pausaAte = iaPausada && cliente?.ai_paused_until ? formatarHorario(cliente.ai_paused_until, agora) : null;
  const pausaDesde = iaPausada && cliente?.ai_paused_at ? formatarHorario(cliente.ai_paused_at, agora) : null;

  // So https vira link (a URL vem do n8n).
  const urlExecucao =
    conversation.execution_url && /^https:\/\//i.test(conversation.execution_url)
      ? conversation.execution_url
      : null;

  const nome = [cliente?.first_name, cliente?.last_name].filter(Boolean).join(' ').trim() || 'Sem nome';
  const inicial = (cliente?.first_name || '?').trim().charAt(0).toUpperCase() || '?';
  const atendente = conversation.transferred_user?.full_name?.trim() || null;
  const departamento = conversation.department?.name?.trim() || null;
  const etiquetas = conversation.tags || [];

  const equipe = teamMembers.filter((m) => m.is_active !== false);
  // Pelo id quando a conversa traz; senao casa pelo nome pra pre-selecionar.
  const atendenteId =
    (conversation.transferred_to && equipe.some((m) => m.id === conversation.transferred_to)
      ? conversation.transferred_to
      : equipe.find((m) => atendente && m.full_name?.trim() === atendente)?.id) || '';

  return (
    <>
      {/* Bloco do contato */}
      <div className="p-4 flex flex-col items-center text-center border-b">
        <Avatar className="h-16 w-16 mb-3">
          {cliente?.avatar_url && <AvatarImage src={cliente.avatar_url} alt={nome} />}
          <AvatarFallback className="text-xl">{inicial}</AvatarFallback>
        </Avatar>
        <p className="font-semibold text-[15px] leading-tight break-words">{nome}</p>
      </div>

      <div className="px-4 py-3 space-y-2 border-b">
        <ContactRow icon={Mail} value={cliente?.email} label="E-mail" />
        <ContactRow icon={Phone} value={cliente?.phone} label="Telefone" />
        <ContactRow icon={MessageCircle} value={cliente?.whatsapp_lid} label="ID do WhatsApp" />
      </div>

      {/* Acoes rapidas */}
      {(onEditContact || onTransfer) && (
        <div className="px-4 py-3 flex items-center gap-2 border-b">
          {onEditContact && cliente && (
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 max-lg:h-10 max-lg:w-10"
              onClick={onEditContact}
              title="Editar contato"
              aria-label="Editar contato"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {onTransfer && (
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 max-lg:h-10 max-lg:w-10"
              onClick={onTransfer}
              title="Transferir conversa"
              aria-label="Transferir conversa"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}

      <div className="p-3 space-y-2">
        <Secao titulo="Ações da conversa" aberta={secoes.acoes} onToggle={() => alternarSecao('acoes')}>
          <Campo
            label="Atendente atribuído"
            acao={
              !atendente && onAssignToMe ? (
                <button
                  onClick={onAssignToMe}
                  className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1 max-lg:min-h-10 max-lg:px-2 max-lg:-mr-2"
                >
                  <UserPlus className="h-3 w-3" />
                  Atribuir a mim
                </button>
              ) : undefined
            }
          >
            {onSelectAgent ? (
              <Select value={atendenteId} onValueChange={(v) => v && v !== atendenteId && onSelectAgent(v)}>
                <SelectTrigger className="h-9 max-lg:h-10 text-[13px]">
                  <SelectValue
                    placeholder={
                      atendente ? (
                        // Atribuido a alguem fora da lista elegivel (ex: inativo).
                        <span className="truncate">{atendente}</span>
                      ) : (
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Bot className="h-4 w-4 text-primary" />
                          IA atendendo
                        </span>
                      )
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {equipe.length === 0 ? (
                    <div className="px-2 py-1.5 text-[13px] text-muted-foreground">Nenhum atendente</div>
                  ) : (
                    equipe.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="text-[13px] max-lg:min-h-10">
                        <span className="flex items-center gap-2">
                          <Avatar className="h-5 w-5">
                            {m.avatar_url && <AvatarImage src={m.avatar_url} alt={m.full_name} />}
                            <AvatarFallback className="text-[10px]">
                              {(m.full_name || '?').charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          {m.full_name}
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex items-center gap-2 rounded-md border bg-background px-2.5 h-9 max-lg:h-10">
                {atendente ? (
                  <>
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="text-[10px]">{atendente.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="text-[13px] truncate">{atendente}</span>
                  </>
                ) : (
                  <>
                    <Bot className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-[13px] text-muted-foreground">IA atendendo</span>
                  </>
                )}
              </div>
            )}
          </Campo>

          {clientId && (
            <Campo label="IA nesta conversa">
              {iaPausada ? (
                <div className="rounded-md border border-orange-500/30 bg-orange-500/10 px-2.5 py-2 space-y-0.5">
                  <p className="text-[13px] font-medium text-orange-800 dark:text-orange-300 flex items-center gap-1.5">
                    <PauseCircle className="h-3.5 w-3.5 shrink-0" />
                    Pausada{quemPausou ? ` ${quemPausou}` : ''}
                  </p>
                  <p className="text-[12px] text-orange-800/80 dark:text-orange-300/80">
                    {pausaAte ? `Volta sozinha às ${pausaAte}` : 'Só volta quando alguém retomar'}
                    {pausaDesde ? ` · desde ${pausaDesde}` : ''}
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-md border bg-background px-2.5 h-9 max-lg:h-10">
                  <Bot className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-[13px] text-muted-foreground">Ativa · responde automaticamente</span>
                </div>
              )}
            </Campo>
          )}

          <Campo label="Departamento">
            {onSelectDepartment ? (
              <Select
                value={conversation.department?.id || ''}
                onValueChange={(v) => v && v !== conversation.department?.id && onSelectDepartment(v)}
              >
                <SelectTrigger className="h-9 max-lg:h-10 text-[13px]">
                  {/* Sem departamento a conversa esta na fila de triagem —
                      dizer "Nenhum" esconderia isso. */}
                  <SelectValue placeholder={<span className="text-muted-foreground">Triagem</span>} />
                </SelectTrigger>
                <SelectContent>
                  {departments.length === 0 ? (
                    <div className="px-2 py-1.5 text-[13px] text-muted-foreground">Nenhum departamento</div>
                  ) : (
                    departments.map((d) => (
                      <SelectItem key={d.id} value={d.id} className="text-[13px] max-lg:min-h-10">
                        <span className="flex items-center gap-2">
                          <Bolinha cor={d.color} />
                          {d.name}
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex items-center gap-2 rounded-md border bg-background px-2.5 h-9 max-lg:h-10">
                {departamento ? (
                  <>
                    <Bolinha cor={conversation.department?.color} />
                    <span className="text-[13px] truncate">{departamento}</span>
                  </>
                ) : (
                  <span className="text-[13px] text-muted-foreground">Triagem</span>
                )}
              </div>
            )}
          </Campo>

          <Campo label="Etiquetas da conversa">
            {etiquetas.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1">
                {etiquetas.map((tag, i) => (
                  <EtiquetaBadge key={`${tag}-${i}`} nome={tag} />
                ))}
                {onOpenTagManager && (
                  <button
                    onClick={onOpenTagManager}
                    className="text-[11px] text-primary hover:underline flex items-center gap-0.5 px-1 max-lg:min-h-10 max-lg:px-2"
                  >
                    <Plus className="h-3 w-3" />
                    Adicionar
                  </button>
                )}
              </div>
            ) : (
              onOpenTagManager && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 max-lg:h-10 text-[12px] text-primary w-full justify-start"
                  onClick={onOpenTagManager}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Adicionar etiquetas
                </Button>
              )
            )}
          </Campo>
        </Secao>

        {/* Atributos do CONTATO — seguem a pessoa, nao a conversa. */}
        <Secao
          titulo="Atributos personalizados"
          aberta={secoes.atributos}
          onToggle={() => alternarSecao('atributos')}
        >
          {carregandoAtributos ? (
            <p className="text-[12px] text-muted-foreground">Carregando…</p>
          ) : atributos.length === 0 ? (
            <p className="text-[12px] text-muted-foreground/70 italic">
              Nenhum atributo. Use para o que precisa ficar à mão: CPF, placa, plano…
            </p>
          ) : (
            <ul className="space-y-2">
              {atributos.map((attr) => (
                <li key={attr.chave} className="group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="block text-[11px] font-medium text-muted-foreground break-words">
                        {attr.chave}
                      </span>
                      <p className="text-[13px] break-words">{attr.valor}</p>
                    </div>
                    {podeEditarContato && (
                      <span className="flex items-center gap-1 shrink-0 max-lg:-mr-2">
                        <button
                          onClick={() => setDialogAtributo({ aberto: true, atributo: attr })}
                          className={cn('text-muted-foreground hover:text-foreground', SO_NO_HOVER, ALVO_TOQUE)}
                          aria-label={`Editar ${attr.chave}`}
                          title="Editar"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => remover(attr.chave)}
                          disabled={isSaving}
                          className={cn(
                            'text-muted-foreground hover:text-destructive disabled:opacity-50',
                            SO_NO_HOVER,
                            ALVO_TOQUE
                          )}
                          aria-label={`Remover ${attr.chave}`}
                          title="Remover"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {podeEditarContato && clientId && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 max-lg:h-10 text-[12px] text-primary w-full justify-start"
              onClick={() => setDialogAtributo({ aberto: true, atributo: null })}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5 mr-1.5" />
              )}
              Adicionar atributo
            </Button>
          )}
        </Secao>

        {/* Notas do CONTATO. A nota da conversa continua no chat e no painel
            "Notas & Lembretes" — aqui e o que vale pra pessoa em qualquer
            atendimento, inclusive por outro numero. */}
        <Secao titulo="Notas do contato" aberta={secoes.notas} onToggle={() => alternarSecao('notas')}>
          {carregandoNotas && notes.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">Carregando…</p>
          ) : notes.length === 0 ? (
            <p className="text-[12px] text-muted-foreground/70 italic">
              Nenhuma nota. Vale para todas as conversas deste contato.
            </p>
          ) : (
            <ul className="space-y-2">
              {notes.map((nota) => (
                <li
                  key={nota.id}
                  className="group rounded-md border bg-amber-50/60 dark:bg-amber-950/20 px-2.5 py-2"
                >
                  <div className="flex items-start gap-2">
                    <StickyNote className="h-3 w-3 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-[12.5px] leading-snug whitespace-pre-wrap break-words flex-1">
                      {nota.note}
                    </p>
                    {podeEditarContato && (
                      <button
                        onClick={() => deleteNote(nota.id)}
                        className={cn(
                          'text-muted-foreground hover:text-destructive shrink-0 max-lg:-mr-2 max-lg:-mt-2',
                          SO_NO_HOVER,
                          ALVO_TOQUE
                        )}
                        aria-label="Remover nota"
                        title="Remover nota"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-[10.5px] text-muted-foreground mt-1 pl-5">
                    {nota.creator?.full_name || 'Alguém'} ·{' '}
                    {new Date(nota.created_at).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: '2-digit',
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {podeEditarContato && clientId && (
            <div className="space-y-1.5">
              <Textarea
                value={novaNota}
                onChange={(e) => setNovaNota(e.target.value)}
                placeholder="Escreva uma nota sobre o contato…"
                rows={2}
                maxLength={2000}
                // >= 16px no celular: abaixo disso o iOS da zoom ao focar.
                className="text-[12.5px] max-lg:text-base resize-none"
                onKeyDown={(e) => {
                  // Ctrl/Cmd+Enter salva — Enter puro quebra linha.
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    enviarNota();
                  }
                }}
              />
              <Button
                size="sm"
                className="h-8 max-lg:h-10 w-full text-[12px]"
                onClick={enviarNota}
                disabled={!novaNota.trim() || salvandoNota}
              >
                {salvandoNota && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Adicionar nota
              </Button>
            </div>
          )}
        </Secao>

        <Secao
          titulo="Informação da conversa"
          aberta={secoes.conversa}
          onToggle={() => alternarSecao('conversa')}
        >
          <Campo label="Status">
            <Badge variant="outline" className="text-[11px]">
              {conversation.status === 'active'
                ? 'Ativa'
                : conversation.status === 'closed'
                  ? 'Fechada'
                  : conversation.status}
            </Badge>
          </Campo>

          <Campo label="Iniciada em">
            <span className="text-[13px]">
              {conversation.started_at && !Number.isNaN(new Date(conversation.started_at).getTime())
                ? new Date(conversation.started_at).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—'}
            </span>
          </Campo>

          {/* Fluxo externo (avaliacao no n8n). So aparece quando a conversa
              passou por um: numa conversa comum nao ha o que mostrar.

              Existe pra responder, sem abrir o banco, as duas perguntas de
              quando o fluxo trava: QUAL execucao e ela ainda esta esperando
              resposta. O link da execucao abre o n8n; a espera diz se o
              CRM ainda vai desviar a proxima mensagem do cliente pra la. */}
          {(conversation.execution_url || conversation.resume_url_expires_at) && (
            <>
              <Campo label="Fluxo externo (n8n)">
                {urlExecucao ? (
                  <a
                    href={urlExecucao}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[12px] text-primary hover:underline inline-flex items-center gap-1 break-all max-lg:min-h-10"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    Abrir execução
                  </a>
                ) : (
                  <span className="text-[12px] text-muted-foreground/70 italic">
                    Sem link. O fluxo ainda não registrou a execução.
                  </span>
                )}
              </Campo>

              <Campo label="Espera do fluxo">
                {esperaDoFluxo ? (
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[11px]',
                      esperaDoFluxo.ativa
                        ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                        : 'border-muted-foreground/30 text-muted-foreground'
                    )}
                  >
                    {esperaDoFluxo.rotulo}
                  </Badge>
                ) : (
                  <span className="text-[12px] text-muted-foreground/70 italic">—</span>
                )}
              </Campo>
            </>
          )}
        </Secao>

        <Secao titulo="Logs da IA" aberta={secoes.logs} onToggle={() => alternarSecao('logs')}>
          {secoes.logs && <ExecutionLogs conversationId={conversation.id} />}
        </Secao>
      </div>

      <ContactAttributeDialog
        open={dialogAtributo.aberto}
        onOpenChange={(aberto) => setDialogAtributo((d) => ({ ...d, aberto }))}
        atributo={dialogAtributo.atributo}
        chavesExistentes={atributos.map((a) => a.chave)}
        onSalvar={definir}
      />
    </>
  );
}

/**
 * Barra lateral direita (desktop, >= lg).
 *
 * O estado aberto/recolhido persiste em localStorage: quem trabalha com o
 * painel recolhido nao quer reabrir a cada conversa que clica.
 */
export const ConversationInfoPanel = memo(function ConversationInfoPanel({
  className,
  ...props
}: ConversationInfoBodyProps & { className?: string }) {
  const [aberto, setAberto] = useState(true);

  // Le do storage so depois da montagem — no servidor nao existe window, e ler
  // no useState inicial causaria divergencia de hidratacao.
  useEffect(() => {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY);
      if (salvo !== null) setAberto(salvo === '1');
    } catch {
      // storage bloqueado — segue com o padrao
    }
  }, []);

  const alternar = () => {
    setAberto((v) => {
      const proximo = !v;
      try {
        localStorage.setItem(STORAGE_KEY, proximo ? '1' : '0');
      } catch {
        // ignora
      }
      return proximo;
    });
  };

  if (!aberto) {
    return (
      <div className={cn('border-l bg-muted/30 flex-col items-center py-2 w-10 shrink-0', className)}>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={alternar}
          aria-label="Expandir informações da conversa"
          title="Expandir informações"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <aside className={cn('border-l bg-muted/20 w-72 shrink-0 flex-col overflow-y-auto', className)}>
      <div className="flex items-center justify-between px-3 h-11 border-b shrink-0 bg-background/50">
        <span className="text-[13px] font-semibold">Informações</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={alternar}
          aria-label="Recolher informações da conversa"
          title="Recolher"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <ConversationInfoBody {...props} />
    </aside>
  );
});

/**
 * Gaveta que sobe de baixo (celular/tablet, < lg), como os "dados do
 * contato" do WhatsApp. Abre ao tocar no nome do contato no cabecalho e fecha
 * arrastando pra baixo.
 *
 * O corpo so monta com a gaveta aberta: sem isso cada conversa aberta no
 * celular buscaria notas e atributos de um contato que ninguem pediu pra ver.
 */
export function ConversationInfoSheet({
  open,
  onOpenChange,
  onOpenTagManager,
  onTransfer,
  onEditContact,
  ...props
}: ConversationInfoBodyProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  // Acao que abre um modal: fecha a gaveta primeiro e so abre o modal quando
  // a animacao de saida termina. Abrir os dois juntos deixa dois dialogs
  // disputando foco e o travamento de scroll do body.
  const pendente = useRef<(() => void) | null>(null);
  // Segue montado durante a animacao de saida, pra gaveta nao descer vazia.
  const [montado, setMontado] = useState(open);
  useEffect(() => {
    if (open) setMontado(true);
  }, [open]);

  const fecharEDepois = (acao?: () => void) =>
    acao
      ? () => {
          pendente.current = acao;
          onOpenChange(false);
        }
      : undefined;

  // Passou pra largura de desktop com a gaveta aberta: a barra lateral assume.
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia('(min-width: 1024px)');
    if (mq.matches) onOpenChange(false);
    const aoMudar = (e: MediaQueryListEvent) => e.matches && onOpenChange(false);
    mq.addEventListener('change', aoMudar);
    return () => mq.removeEventListener('change', aoMudar);
  }, [open, onOpenChange]);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      shouldScaleBackground={false}
      onAnimationEnd={(aberta) => {
        if (aberta) return;
        setMontado(false);
        const acao = pendente.current;
        pendente.current = null;
        acao?.();
      }}
    >
      <DrawerContent className="lg:hidden max-h-[92dvh] bg-muted/20 pb-[env(safe-area-inset-bottom)]">
        <DrawerTitle className="sr-only">Dados do contato</DrawerTitle>
        {(open || montado) && (
          <div className="overflow-y-auto overscroll-contain mt-2">
            <ConversationInfoBody
              {...props}
              onOpenTagManager={fecharEDepois(onOpenTagManager)}
              onTransfer={fecharEDepois(onTransfer)}
              onEditContact={fecharEDepois(onEditContact)}
            />
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}

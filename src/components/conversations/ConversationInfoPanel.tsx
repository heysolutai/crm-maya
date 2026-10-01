'use client';

import { memo, useEffect, useState } from 'react';
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
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useContactAttributes } from '@/hooks/useContactAttributes';
import { useClientNotes } from '@/hooks/useClientNotes';
import { ContactAttributeDialog } from './dialogs/ContactAttributeDialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Conversation, TeamMember } from './types';

interface Departamento {
  id: string;
  name: string;
  color?: string | null;
}

const STORAGE_KEY = 'conversation_info_panel_open';

interface Props {
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
  className?: string;
}

/** Linha de dado do contato, com botao de copiar quando ha valor. */
function ContactRow({
  icon: Icon,
  value,
  copiavel,
}: {
  icon: typeof Mail;
  value?: string | null;
  copiavel?: boolean;
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
    <div className="flex items-center gap-2 group min-w-0">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span
        className={cn(
          'text-[13px] truncate flex-1',
          vazio ? 'text-muted-foreground/60 italic' : 'text-foreground'
        )}
      >
        {vazio ? 'Indisponível' : value}
      </span>
      {copiavel && !vazio && (
        <button
          onClick={copiar}
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Copiar"
          title="Copiar"
        >
          {copiado ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}

/** Card com titulo e conteudo recolhivel, no formato da referencia. */
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

/** Rotulo + valor, empilhados, no estilo dos campos da referencia. */
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
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        {acao}
      </div>
      {children}
    </div>
  );
}

/**
 * Painel lateral direito com o contexto da conversa.
 *
 * Estrutura espelha a referencia do Chatwoot: bloco de contato no topo (avatar,
 * nome, dados, acoes) e cards recolhiveis abaixo. As informacoes que o dono
 * pediu — atendente, departamento e etiquetas — ficam no card "Ações da
 * conversa".
 *
 * O estado de aberto/fechado persiste em localStorage: quem trabalha com o
 * painel recolhido nao quer reabrir a cada conversa que clica.
 */
export const ConversationInfoPanel = memo(function ConversationInfoPanel({
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
  className,
}: Props) {
  const [aberto, setAberto] = useState(true);
  const [secoes, setSecoes] = useState({ acoes: true, contato: true, atributos: true, notas: true });

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

  const cliente = conversation.client;
  const clientId = cliente?.id ?? null;

  // Atributos e notas sao do CONTATO (nao da conversa): valem para todas as
  // conversas dele, inclusive as de outro numero da empresa.
  const { atributos, isLoading: carregandoAtributos, definir, remover, isSaving } =
    useContactAttributes(clientId);
  const { notes, loading: carregandoNotas, addNote, deleteNote } = useClientNotes(clientId);

  const [dialogAtributo, setDialogAtributo] = useState<{ aberto: boolean; atributo: { chave: string; valor: string } | null }>({
    aberto: false,
    atributo: null,
  });
  const [novaNota, setNovaNota] = useState('');
  const [salvandoNota, setSalvandoNota] = useState(false);

  // O painel NAO remonta ao trocar de conversa. Sem limpar aqui, um rascunho
  // de nota digitado num contato seria salvo no proximo — e o dialog abriria
  // com o atributo do contato anterior.
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

  const nome = [cliente?.first_name, cliente?.last_name].filter(Boolean).join(' ').trim() || 'Sem nome';
  const inicial = (cliente?.first_name || '?').trim().charAt(0).toUpperCase();
  const atendente = conversation.transferred_user?.full_name?.trim() || null;
  const departamento = conversation.department?.name?.trim() || null;
  const etiquetas = conversation.tags || [];

  if (!aberto) {
    return (
      <div className={cn('border-l bg-muted/30 flex flex-col items-center py-3 w-10 shrink-0', className)}>
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
    <aside className={cn('border-l bg-muted/20 w-72 shrink-0 flex flex-col overflow-y-auto', className)}>
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

      {/* Bloco do contato */}
      <div className="p-4 flex flex-col items-center text-center border-b">
        <Avatar className="h-16 w-16 mb-3">
          {cliente?.avatar_url && <AvatarImage src={cliente.avatar_url} alt={nome} />}
          <AvatarFallback className="text-xl">{inicial}</AvatarFallback>
        </Avatar>
        <p className="font-semibold text-[15px] leading-tight break-words">{nome}</p>
      </div>

      <div className="px-4 py-3 space-y-2 border-b">
        <ContactRow icon={Mail} value={cliente?.email} copiavel />
        <ContactRow icon={Phone} value={cliente?.phone} copiavel />
        <ContactRow icon={MessageCircle} value={cliente?.whatsapp_lid} copiavel />
      </div>

      {/* Acoes rapidas do contato */}
      {(onEditContact || onTransfer) && (
        <div className="px-4 py-3 flex items-center gap-2 border-b">
          {onEditContact && (
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
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
              className="h-8 w-8"
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
        <Secao
          titulo="Ações da conversa"
          aberta={secoes.acoes}
          onToggle={() => setSecoes((s) => ({ ...s, acoes: !s.acoes }))}
        >
          <Campo
            label="Atendente atribuído"
            acao={
              !atendente && onAssignToMe ? (
                <button
                  onClick={onAssignToMe}
                  className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1"
                >
                  <UserPlus className="h-3 w-3" />
                  Atribuir a mim
                </button>
              ) : undefined
            }
          >
            {onSelectAgent ? (
              <Select
                // Sem id do atendente na conversa (so o nome), casa pelo nome
                // pra deixar o atual pre-selecionado.
                value={teamMembers.find((m) => m.full_name === atendente)?.id || ''}
                onValueChange={(v) => v && onSelectAgent(v)}
              >
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue
                    placeholder={
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Bot className="h-4 w-4 text-primary" />
                        IA atendendo
                      </span>
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.length === 0 ? (
                    <div className="px-2 py-1.5 text-[13px] text-muted-foreground">
                      Nenhum atendente
                    </div>
                  ) : (
                    teamMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="text-[13px]">
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
              <div className="flex items-center gap-2 rounded-md border bg-background px-2.5 h-9">
                {atendente ? (
                  <>
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="text-[10px]">
                        {atendente.charAt(0).toUpperCase()}
                      </AvatarFallback>
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

          <Campo label="Departamento">
            {onSelectDepartment ? (
              <Select
                value={conversation.department?.id || ''}
                onValueChange={(v) => v && onSelectDepartment(v)}
              >
                <SelectTrigger className="h-9 text-[13px]">
                  {/* Sem departamento a conversa esta na fila de triagem —
                      dizer "Nenhum" esconderia isso. */}
                  <SelectValue
                    placeholder={<span className="text-muted-foreground">Triagem</span>}
                  />
                </SelectTrigger>
                <SelectContent>
                  {departments.length === 0 ? (
                    <div className="px-2 py-1.5 text-[13px] text-muted-foreground">
                      Nenhum departamento
                    </div>
                  ) : (
                    departments.map((d) => (
                      <SelectItem key={d.id} value={d.id} className="text-[13px]">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: d.color || '#6b7280' }}
                          />
                          {d.name}
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex items-center gap-2 rounded-md border bg-background px-2.5 h-9">
                {departamento ? (
                  <>
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: conversation.department?.color || '#6b7280' }}
                    />
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
              <div className="flex flex-wrap gap-1">
                {etiquetas.map((tag, i) => (
                  <Badge key={`${tag}-${i}`} variant="secondary" className="text-[11px] h-5 px-2">
                    {tag}
                  </Badge>
                ))}
                {onOpenTagManager && (
                  <button
                    onClick={onOpenTagManager}
                    className="text-[11px] text-primary hover:underline flex items-center gap-0.5 px-1"
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
                  className="h-8 text-[12px] text-primary w-full justify-start"
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
          onToggle={() => setSecoes((s) => ({ ...s, atributos: !s.atributos }))}
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
                <li key={attr.chave} className="group/attr">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground break-words">
                      {attr.chave}
                    </span>
                    {podeEditarContato && (
                      <span className="flex items-center gap-1 opacity-0 group-hover/attr:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => setDialogAtributo({ aberto: true, atributo: attr })}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label={`Editar ${attr.chave}`}
                          title="Editar"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => remover(attr.chave)}
                          disabled={isSaving}
                          className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                          aria-label={`Remover ${attr.chave}`}
                          title="Remover"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] break-words">{attr.valor}</p>
                </li>
              ))}
            </ul>
          )}

          {podeEditarContato && clientId && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-[12px] text-primary w-full justify-start"
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
        <Secao
          titulo="Notas do contato"
          aberta={secoes.notas}
          onToggle={() => setSecoes((s) => ({ ...s, notas: !s.notas }))}
        >
          {carregandoNotas ? (
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
                  className="group/nota rounded-md border bg-amber-50/60 dark:bg-amber-950/20 px-2.5 py-2"
                >
                  <div className="flex items-start gap-2">
                    <StickyNote className="h-3 w-3 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-[12.5px] leading-snug whitespace-pre-wrap break-words flex-1">
                      {nota.note}
                    </p>
                    {podeEditarContato && (
                      <button
                        onClick={() => deleteNote(nota.id)}
                        className="opacity-0 group-hover/nota:opacity-100 focus:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
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
                className="text-[12.5px] resize-none"
                onKeyDown={(e) => {
                  // Ctrl/Cmd+Enter salva — Enter puro quebra linha.
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') enviarNota();
                }}
              />
              <Button
                size="sm"
                className="h-8 w-full text-[12px]"
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
          aberta={secoes.contato}
          onToggle={() => setSecoes((s) => ({ ...s, contato: !s.contato }))}
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
              {conversation.started_at
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
                {conversation.execution_url ? (
                  <a
                    href={conversation.execution_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[12px] text-primary hover:underline inline-flex items-center gap-1 break-all"
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
      </div>

      <ContactAttributeDialog
        open={dialogAtributo.aberto}
        onOpenChange={(aberto) => setDialogAtributo((d) => ({ ...d, aberto }))}
        atributo={dialogAtributo.atributo}
        chavesExistentes={atributos.map((a) => a.chave)}
        onSalvar={definir}
      />
    </aside>
  );
});

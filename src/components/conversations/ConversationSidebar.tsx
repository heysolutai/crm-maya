import { memo, useState, useEffect, useRef } from 'react';
import { Search, Plus, Tag, X, Image, Mic, FileText, MapPin, Video, Clock, Bot, User as UserIcon, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RealtimeStatusIndicator } from '@/components/conversations/RealtimeStatusIndicator';
import { ConversationFilters } from '@/components/conversations/ConversationFilters';
import { ConversationListSkeleton } from '@/components/ui/skeleton-list';
import { cn, formatRelativeTime } from '@/lib/utils';
import {
  getInitials,
  formatPhoneMasked,
  getConversationStatusInfo,
  type Conversation,
  type LastMessage,
  type TeamMember,
} from './types';

function getMessagePreview(msg: LastMessage | null | undefined): { icon?: React.ReactNode; text: string } {
  if (!msg) return { text: '' };
  const prefix = msg.sender_type === 'client' ? '' : 'Você: ';

  switch (msg.type) {
    case 'image':
      return { icon: <Image className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />, text: `${prefix}Foto` };
    case 'audio':
      return { icon: <Mic className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />, text: `${prefix}Áudio` };
    case 'video':
      return { icon: <Video className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />, text: `${prefix}Vídeo` };
    case 'document':
      return { icon: <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />, text: `${prefix}Documento` };
    case 'location':
      return { icon: <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />, text: `${prefix}Localização` };
    case 'sticker':
      return { text: `${prefix}Sticker` };
    case 'contact':
    case 'vcard':
      return { text: `${prefix}Contato` };
    default:
      return { text: `${prefix}${msg.text || ''}` };
  }
}

interface Department {
  id: string;
  name: string;
  color: string;
}

interface AgentSummary {
  id: string;
  display_name: string;
  channel_type: string;
}

interface ConversationSidebarProps {
  conversations: Conversation[] | undefined;
  selectedConversation: string | null;
  onSelectConversation: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  departmentFilter: string;
  onDepartmentFilterChange: (value: string) => void;
  userFilter: string;
  onUserFilterChange: (value: string) => void;
  agentFilter: string;
  onAgentFilterChange: (value: string) => void;
  agents: AgentSummary[];
  teamMembers: TeamMember[];
  departments: Department[];
  queueCounts: Record<string, number>;
  tagFilters: string[];
  onToggleTagFilter: (tag: string) => void;
  allTags: string[];
  isLoading: boolean;
  realtimeStatus: 'connected' | 'connecting' | 'disconnected';
  usePolling: boolean;
  onRefresh: () => void;
  onNewConversation: () => void;
  onPickupConversation?: (conversationId: string) => void;
  // Infinite scroll — total real da empresa + callback pra carregar mais.
  // Quando o usuario chega no fim da lista, chama onLoadMore se hasMore.
  totalConversations?: number;
  hasMoreConversations?: boolean;
  onLoadMore?: () => void;
}

const channelLabel: Record<string, string> = {
  uazapi: 'WhatsApp',
  evolution_baileys: 'WhatsApp',
  evolution_go: 'WhatsApp',
  zapi: 'WhatsApp',
  whatsapp_cloud: 'WhatsApp Cloud',
  instagram: 'Instagram',
};

export const ConversationSidebar = memo(function ConversationSidebar({
  conversations,
  selectedConversation,
  onSelectConversation,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  departmentFilter,
  onDepartmentFilterChange,
  userFilter,
  onUserFilterChange,
  agentFilter,
  onAgentFilterChange,
  agents,
  teamMembers,
  departments,
  queueCounts,
  tagFilters,
  onToggleTagFilter,
  allTags,
  isLoading,
  realtimeStatus,
  usePolling,
  onRefresh,
  onNewConversation,
  onPickupConversation,
  totalConversations,
  hasMoreConversations,
  onLoadMore,
}: ConversationSidebarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  // ref pra detectar quando o usuario chegou perto do fim e disparar loadMore.
  // Usa Intersection Observer no elemento sentinela no final da lista.
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const filteredConversations =
    statusFilter === 'unread'
      ? conversations?.filter((c) => (c.unread_count || 0) > 0)
      : statusFilter === 'transferred'
        ? conversations?.filter((c) => !!c.transferred_user)
        : conversations;

  const filteredCount = filteredConversations?.length || 0;
  useEffect(() => {
    if (!hasMoreConversations || !onLoadMore || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: '300px' } // dispara 300px antes do fim — UX mais fluida
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMoreConversations, onLoadMore, filteredCount]);

  return (
    <div className="w-full md:w-[420px] border-r border-border flex flex-col h-full min-h-0">
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">Conversas</h1>
            <RealtimeStatusIndicator
              status={realtimeStatus}
              usePolling={usePolling}
              onRefresh={onRefresh}
            />
          </div>
          <Button size="sm" onClick={onNewConversation} aria-label="Iniciar nova conversa">
            <Plus className="h-4 w-4 mr-1" />
            Nova
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Buscar conversas..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 h-10"
            aria-label="Buscar conversas"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1">
            <ConversationFilters
              open={filtersOpen}
              onOpenChange={setFiltersOpen}
              conversations={conversations}
              departments={departments}
              teamMembers={teamMembers}
              queueCounts={queueCounts}
              statusFilter={statusFilter}
              onStatusFilterChange={onStatusFilterChange}
              departmentFilter={departmentFilter}
              onDepartmentFilterChange={onDepartmentFilterChange}
              userFilter={userFilter}
              onUserFilterChange={onUserFilterChange}
            />
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="shrink-0" aria-label="Filtrar por etiquetas">
                <Tag className="h-4 w-4" />
                {tagFilters.length > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[9px] bg-primary text-primary-foreground">
                    {tagFilters.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Filtrar por etiquetas</h4>
                {allTags.length > 0 ? (
                  <div className="space-y-1">
                    {allTags.map((tag) => (
                      <label
                        key={tag}
                        className="flex items-center gap-2 cursor-pointer hover:bg-accent p-2 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={tagFilters.includes(tag)}
                          onChange={() => onToggleTagFilter(tag)}
                          className="rounded"
                        />
                        <span className="text-sm">{tag}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma etiqueta encontrada</p>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {tagFilters.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tagFilters.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1">
                {tag}
                <button onClick={() => onToggleTagFilter(tag)} aria-label={`Remover filtro ${tag}`}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Secção de Canais — filtra a lista por agente */}
      {agents.length > 0 && (
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Canais
            </h2>
            {agentFilter !== 'all' && (
              <button
                onClick={() => onAgentFilterChange('all')}
                className="text-[10px] text-primary hover:underline"
              >
                Limpar
              </button>
            )}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            <button
              type="button"
              onClick={() => onAgentFilterChange('all')}
              className={cn(
                'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors border whitespace-nowrap',
                agentFilter === 'all'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted'
              )}
            >
              Todos
              <span className="ml-1.5 opacity-70">
                ({totalConversations ?? conversations?.length ?? 0})
              </span>
            </button>
            {agents.map((a) => {
              const count = (conversations || []).filter(
                (c: any) => c.whatsappInstanceId === a.id || c.agent?.id === a.id
              ).length;
              const isActive = agentFilter === a.id;
              const label = channelLabel[a.channel_type] || a.channel_type;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onAgentFilterChange(a.id)}
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors border whitespace-nowrap inline-flex items-center gap-1.5',
                    isActive
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted'
                  )}
                  title={`${a.display_name} (${label})`}
                >
                  <span className="truncate max-w-[120px]">{a.display_name}</span>
                  <span className="opacity-60 text-[10px]">({label})</span>
                  {count > 0 && (
                    <span className={cn('opacity-70 text-[10px]', isActive && 'opacity-90')}>
                      · {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <ScrollArea className="flex-1 min-w-0" role="list" aria-label="Lista de conversas">
        {isLoading ? (
          <ConversationListSkeleton count={6} />
        ) : filteredConversations?.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            {statusFilter === 'unread'
              ? 'Nenhuma mensagem não lida'
              : 'Nenhuma conversa encontrada'}
          </div>
        ) : (
          <div className="p-2 space-y-2 w-full max-w-full overflow-hidden">
            {filteredConversations?.map((conv) => {
              const clientName = conv.client
                ? `${conv.client.first_name} ${conv.client.last_name || ''}`.trim()
                : 'Cliente';

              const unreadCount = conv.unread_count || 0;
              const hasUnread = unreadCount > 0;
              const preview = getMessagePreview(conv.last_message);
              const lastTime = conv.last_message?.created_at || conv.started_at;
              const isSelected = selectedConversation === conv.id;
              const statusInfo = getConversationStatusInfo(conv);
              const phoneMasked = formatPhoneMasked(conv.client?.phone);

              // Estilo do badge de status conforme variant
              const statusBadgeClass =
                statusInfo.variant === 'pending'
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30'
                  : statusInfo.variant === 'human'
                    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/30'
                    : statusInfo.variant === 'closed'
                      ? 'bg-muted text-muted-foreground ring-1 ring-border'
                      : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/30';

              const StatusIcon =
                statusInfo.variant === 'pending'
                  ? Clock
                  : statusInfo.variant === 'human'
                    ? UserIcon
                    : statusInfo.variant === 'closed'
                      ? CheckCircle2
                      : Bot;

              return (
                <button
                  key={conv.id}
                  onClick={() => onSelectConversation(conv.id)}
                  role="listitem"
                  aria-selected={isSelected}
                  aria-label={`Conversa com ${clientName}${hasUnread ? `, ${unreadCount} mensagens não lidas` : ''}`}
                  className={cn(
                    'group block w-full max-w-full rounded-xl border bg-card text-left transition-all overflow-hidden',
                    'hover:border-primary/40 hover:shadow-sm',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isSelected
                      ? 'border-primary/60 ring-2 ring-primary/30 shadow-sm'
                      : 'border-border'
                  )}
                >
                  {/* Avatar fixo na esquerda + coluna direita com flex-1/min-w-0
                      contendo todo o resto. min-w-0 em CADA flex parent eh o
                      que permite o truncate funcionar dentro da sidebar
                      (sem isso o conteudo expandiria alem do container). */}
                  <div className="p-3 flex items-start gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={conv.client?.avatar_url || undefined} alt={clientName} />
                        <AvatarFallback className="text-xs font-semibold bg-primary/15 text-primary">
                          {getInitials(clientName)}
                        </AvatarFallback>
                      </Avatar>
                      {hasUnread && (
                        <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-primary rounded-full ring-2 ring-card" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      {/* Linha 1: nome + tempo */}
                      <div className="flex items-baseline justify-between gap-2 min-w-0">
                        <h3
                          className={cn(
                            'text-sm leading-tight truncate min-w-0',
                            hasUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground'
                          )}
                        >
                          {clientName}
                        </h3>
                        <time
                          className={cn(
                            'text-[11px] shrink-0 tabular-nums',
                            hasUnread ? 'text-primary font-medium' : 'text-muted-foreground'
                          )}
                        >
                          {formatRelativeTime(lastTime)}
                        </time>
                      </div>

                      {/* Linha 2: telefone mascarado */}
                      {phoneMasked && (
                        <p className="text-[11px] font-mono text-muted-foreground/80 leading-tight truncate">
                          {phoneMasked}
                        </p>
                      )}

                      {/* Linha 3: mensagem preview + badge de unread */}
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <div
                          className={cn(
                            'text-[13px] leading-snug flex items-center gap-1.5 min-w-0 flex-1',
                            hasUnread ? 'text-foreground font-medium' : 'text-muted-foreground'
                          )}
                        >
                          {preview.icon}
                          <span className="truncate min-w-0">{preview.text || 'Sem mensagens'}</span>
                        </div>
                        {unreadCount > 0 && (
                          <Badge className="h-5 min-w-[20px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold shrink-0">
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </Badge>
                        )}
                      </div>

                      {/* Linha 4: status badge + departamento/agente/atender.
                          flex-wrap permite quebrar pra outra linha se nao
                          couber tudo, em vez de estourar o container. */}
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium shrink-0',
                            statusBadgeClass
                          )}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {statusInfo.label}
                        </span>
                        {conv.department && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 inline-flex items-center rounded font-medium shrink-0 max-w-[80px] truncate"
                            style={{
                              backgroundColor: `${conv.department.color}20`,
                              color: conv.department.color,
                            }}
                            title={conv.department.name}
                          >
                            {conv.department.name}
                          </span>
                        )}
                        {(conv as any).agent && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 inline-flex items-center rounded font-medium bg-primary/10 text-primary shrink-0 max-w-[80px] truncate"
                            title={`Recebido por ${(conv as any).agent.display_name}`}
                          >
                            {(conv as any).agent.display_name}
                          </span>
                        )}
                        {conv.status === 'pending' && onPickupConversation && (
                          <button
                            className="text-[10px] text-primary font-semibold hover:underline shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPickupConversation(conv.id);
                            }}
                          >
                            Atender
                          </button>
                        )}
                      </div>

                      {/* Linha 5 (opcional): tags */}
                      {conv.tags && conv.tags.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap min-w-0">
                          {conv.tags.slice(0, 3).map((tag, idx) => (
                            <Badge
                              key={idx}
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 h-4 max-w-[80px] truncate"
                              title={tag}
                            >
                              {tag}
                            </Badge>
                          ))}
                          {conv.tags.length > 3 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{conv.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
            {/* Sentinel pra disparar loadMore quando o usuario chega no fim */}
            {hasMoreConversations && (
              <div ref={sentinelRef} className="py-3 text-center text-[11px] text-muted-foreground">
                Carregando mais conversas...
              </div>
            )}
            {!hasMoreConversations && totalConversations && totalConversations > 0 && filteredCount > 0 && (
              <div className="py-3 text-center text-[10px] text-muted-foreground/60">
                {filteredCount} de {totalConversations} conversas
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
});

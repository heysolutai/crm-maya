import { memo, useState } from 'react';
import { Search, Plus, Tag, X, Image, Mic, FileText, MapPin, Video } from 'lucide-react';
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
import { getInitials, type Conversation, type LastMessage, type TeamMember } from './types';

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
}: ConversationSidebarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filteredConversations =
    statusFilter === 'unread'
      ? conversations?.filter((c) => (c.unread_count || 0) > 0)
      : statusFilter === 'transferred'
        ? conversations?.filter((c) => !!c.transferred_user)
        : conversations;

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
              <span className="ml-1.5 opacity-70">({conversations?.length || 0})</span>
            </button>
            {agents.map((a) => {
              const count = (conversations || []).filter(
                (c: any) => c.inboxId === a.id || c.whatsappInstanceId === a.id || c.agent?.id === a.id
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

      <ScrollArea className="flex-1" role="list" aria-label="Lista de conversas">
        {isLoading ? (
          <ConversationListSkeleton count={6} />
        ) : filteredConversations?.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            {statusFilter === 'unread'
              ? 'Nenhuma mensagem não lida'
              : 'Nenhuma conversa encontrada'}
          </div>
        ) : (
          filteredConversations?.map((conv) => {
            const clientName = conv.client
              ? `${conv.client.first_name} ${conv.client.last_name || ''}`.trim()
              : 'Cliente';

            const unreadCount = conv.unread_count || 0;
            const hasUnread = unreadCount > 0;
            const preview = getMessagePreview(conv.last_message);
            const lastTime = conv.last_message?.created_at || conv.started_at;

            return (
              <button
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                role="listitem"
                aria-selected={selectedConversation === conv.id}
                aria-label={`Conversa com ${clientName}${hasUnread ? `, ${unreadCount} mensagens não lidas` : ''}`}
                className={cn(
                  "w-full px-4 py-3 border-b border-border transition-colors text-left cursor-pointer",
                  "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  selectedConversation === conv.id && "bg-accent",
                  hasUnread && selectedConversation !== conv.id && "bg-primary/5"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <Avatar className="h-11 w-11">
                      <AvatarImage src={conv.client?.avatar_url || undefined} alt={clientName} />
                      <AvatarFallback className="text-sm">{getInitials(clientName)}</AvatarFallback>
                    </Avatar>
                    {hasUnread && (
                      <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-primary rounded-full border-2 border-background" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Row 1: Name + Timestamp */}
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className={cn(
                        "text-sm truncate",
                        hasUnread ? "font-bold" : "font-medium"
                      )}>{clientName}</h3>
                      <time className={cn(
                        "text-[11px] shrink-0",
                        hasUnread ? "text-primary font-semibold" : "text-muted-foreground"
                      )}>
                        {formatRelativeTime(lastTime)}
                      </time>
                    </div>

                    {/* Row 2: Last message preview + unread badge */}
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className={cn(
                        "text-[13px] truncate flex items-center gap-1",
                        hasUnread ? "text-foreground font-medium" : "text-muted-foreground"
                      )}>
                        {preview.icon}
                        <span className="truncate">{preview.text || 'Sem mensagens'}</span>
                      </p>
                      {unreadCount > 0 && (
                        <Badge className="h-5 min-w-[20px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold shrink-0">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </Badge>
                      )}
                    </div>

                    {/* Row 3: Status dot + agent + tags */}
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        conv.status === 'active' && !conv.transferred_user && "bg-green-500",
                        conv.status === 'pending' && "bg-yellow-500",
                        conv.status === 'closed' && "bg-gray-400",
                        conv.status === 'active' && conv.transferred_user && "bg-blue-500"
                      )} />
                      <span className="text-[11px] text-muted-foreground truncate">
                        {conv.transferred_user
                          ? conv.transferred_user.full_name
                          : 'IA'
                        }
                      </span>
                      {conv.department && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <span
                            className="text-[10px] px-1.5 py-0 h-4 inline-flex items-center rounded font-medium"
                            style={{ backgroundColor: `${conv.department.color}20`, color: conv.department.color }}
                          >
                            {conv.department.name}
                          </span>
                        </>
                      )}
                      {(conv as any).agent && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <span
                            className="text-[10px] px-1.5 py-0 h-4 inline-flex items-center rounded font-medium bg-primary/10 text-primary"
                            title={`Recebido por ${(conv as any).agent.display_name}`}
                          >
                            {(conv as any).agent.display_name}
                          </span>
                        </>
                      )}
                      {conv.status === 'pending' && onPickupConversation && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <button
                            className="text-[10px] text-primary font-semibold hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPickupConversation(conv.id);
                            }}
                          >
                            Atender
                          </button>
                        </>
                      )}
                      {conv.tags && conv.tags.length > 0 && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          {conv.tags.slice(0, 2).map((tag, idx) => (
                            <Badge key={idx} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                              {tag}
                            </Badge>
                          ))}
                          {conv.tags.length > 2 && (
                            <span className="text-[10px] text-muted-foreground">+{conv.tags.length - 2}</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </ScrollArea>
    </div>
  );
});

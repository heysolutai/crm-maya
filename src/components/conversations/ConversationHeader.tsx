import { memo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Phone, Bot, Loader2, ArrowLeft, MoreVertical, StickyNote, UserCheck, RefreshCw, X, Tag, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { createWhatsAppLink } from '@/lib/linkify';
import { statusColors, statusLabels, type Conversation, type ConversationStatus } from './types';

interface ConversationHeaderProps {
  conversation: Conversation;
  isTogglingAIPaused: boolean;
  onToggleAIPaused: () => void;
  onOpenNotes: () => void;
  onTransfer: () => void;
  onClose: () => void;
  onReopen: () => void;
  onOpenTagManager: () => void;
  onRemoveTag: (tag: string) => void;
  onBack?: () => void;
}

export const ConversationHeader = memo(function ConversationHeader({
  conversation,
  isTogglingAIPaused,
  onToggleAIPaused,
  onOpenNotes,
  onTransfer,
  onClose,
  onReopen,
  onOpenTagManager,
  onRemoveTag,
  onBack,
}: ConversationHeaderProps) {
  const clientName = conversation.client 
    ? `${conversation.client.first_name} ${conversation.client.last_name || ''}`.trim()
    : 'Cliente';

  const initials = clientName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

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
            </div>
          </PopoverContent>
        </Popover>

        {/* Name + status */}
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold truncate">{clientName}</h2>
          <div className="flex items-center gap-1.5">
            <Badge 
              variant="outline" 
              className={`${statusColors[conversation.status as ConversationStatus]} text-white border-0 text-[10px] px-1.5 py-0 h-4`}
            >
              {statusLabels[conversation.status as ConversationStatus]}
            </Badge>
            <span className="text-[11px] text-muted-foreground truncate">
              {conversation.started_at
                ? (() => { try { const d = new Date(conversation.started_at); return isNaN(d.getTime()) ? '' : format(d, "dd/MM/yy HH:mm", { locale: ptBR }); } catch { return ''; } })()
                : ''}
            </span>
          </div>
        </div>

        {/* AI Pause button */}
        {conversation.client?.id && (
          <Button 
            variant="ghost"
            size="sm"
            onClick={onToggleAIPaused}
            disabled={isTogglingAIPaused}
            className={`shrink-0 h-8 px-2 text-xs gap-1 ${
              conversation.client?.ai_paused 
                ? "bg-orange-500/15 text-orange-600 hover:bg-orange-500/25 dark:text-orange-400" 
                : "text-muted-foreground"
            }`}
          >
            {isTogglingAIPaused ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Bot className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {conversation.client?.ai_paused ? "IA Pausada" : "Pausar IA"}
                </span>
              </>
            )}
          </Button>
        )}

        {/* 3-dot menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={onOpenNotes}>
              <StickyNote className="h-4 w-4 mr-2" />
              Notas & Lembretes
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenTagManager}>
              <Tag className="h-4 w-4 mr-2" />
              Etiquetas
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
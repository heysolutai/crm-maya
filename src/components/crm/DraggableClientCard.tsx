import { useDraggable } from "@dnd-kit/core";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Phone, Mail, Calendar, DollarSign, Clock, BadgeCheck, MoreVertical, Pencil, Trash2, ArrowRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CSS } from "@dnd-kit/utilities";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { memo } from "react";

interface FunnelStage {
  id: string;
  name: string;
  color: string;
}

interface ClientWithStage {
  id: string;
  first_name: string;
  last_name?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  created_at?: string;
  source?: string;
  next_appointment?: string;
  total_appointments?: number;
  total_sales?: number;
  total_revenue?: number;
  avatar_url?: string;
  stage_id?: string;
}

interface DraggableClientCardProps {
  client: ClientWithStage;
  isDragOverlay?: boolean;
  onClick?: (clientId: string) => void;
  stages?: FunnelStage[];
  onEdit?: (client: ClientWithStage) => void;
  onDelete?: (clientId: string) => void;
  onMoveToStage?: (clientId: string, stageId: string) => void;
}

const DraggableClientCard = memo(({ 
  client, 
  isDragOverlay = false, 
  onClick,
  stages = [],
  onEdit,
  onDelete,
  onMoveToStage,
}: DraggableClientCardProps) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: client.id,
  });

  const handleClick = (e: React.MouseEvent) => {
    if (!isDragging && onClick) {
      onClick(client.id);
    }
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    cursor: isDragging ? "grabbing" : "pointer",
  };

  const hasHighValue = (client.total_sales ?? 0) > 0;

  // Filter out current stage for move submenu
  const otherStages = stages.filter(s => s.id !== client.stage_id);

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={handleClick}
      className={`
        relative overflow-hidden p-3 group/card
        bg-gradient-to-b from-background to-muted/30
        dark:from-zinc-900/80 dark:to-zinc-950/90
        border border-border/50 dark:border-zinc-800/60
        ${!isDragOverlay && !isDragging ? "hover:border-primary/30 dark:hover:border-zinc-600/80 hover:shadow-lg hover:shadow-primary/5" : ""}
        transition-all duration-200
        ${isDragOverlay ? "shadow-2xl shadow-primary/20 dark:shadow-black/50 rotate-[-2deg] scale-105 border-primary/50" : ""}
        ${isDragging ? "invisible" : ""}
      `}
    >
      {/* Quick Actions Menu */}
      {!isDragOverlay && (onEdit || onDelete || onMoveToStage) && (
        <div className="absolute top-2 right-2 z-10 opacity-0 group-hover/card:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 bg-background/80 dark:bg-zinc-900/80 backdrop-blur-sm hover:bg-muted"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              align="end" 
              className="w-48 bg-popover border border-border shadow-lg"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(client)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar
                </DropdownMenuItem>
              )}
              
              {onMoveToStage && otherStages.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Mover para
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="bg-popover border border-border shadow-lg">
                    {otherStages.map((stage) => (
                      <DropdownMenuItem 
                        key={stage.id}
                        onClick={() => onMoveToStage(client.id, stage.id)}
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-full mr-2"
                          style={{ backgroundColor: stage.color }}
                        />
                        {stage.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => onDelete(client.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <div className="relative space-y-2.5">
        {/* Header: Avatar + Nome + Verificado */}
        <div className="flex items-start gap-3">
          <div className="relative">
            <Avatar className="h-11 w-11 shrink-0 ring-2 ring-primary/20 ring-offset-2 ring-offset-background dark:ring-offset-zinc-900 transition-all duration-300 hover:ring-primary/50">
              {client.avatar_url ? (
                <AvatarImage src={client.avatar_url} alt={client.first_name} />
              ) : null}
              <AvatarFallback className="text-xs font-medium bg-gradient-to-br from-primary/20 to-primary/10 text-primary">
                {client.first_name[0]}{client.last_name?.[0] || ''}
              </AvatarFallback>
            </Avatar>
            {/* Online indicator for high-value clients */}
            {hasHighValue && (
              <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-background dark:ring-zinc-900" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="font-semibold text-sm text-foreground truncate">
                {client.first_name} {client.last_name}
              </h4>
              {hasHighValue && (
                <BadgeCheck className="h-4 w-4 shrink-0 text-blue-500 fill-blue-500/20" />
              )}
            </div>
            {client.source && (
              <Badge 
                variant="secondary" 
                className="text-[10px] mt-1 px-1.5 py-0 h-4 bg-muted/50 dark:bg-zinc-800/50 text-muted-foreground"
              >
                {client.source}
              </Badge>
            )}
          </div>
        </div>

        {/* Contatos */}
        <div className="space-y-1">
          {client.email && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground group/email">
              <Mail className="h-3 w-3 shrink-0 group-hover/email:text-primary transition-colors" />
              <span className="truncate">{client.email}</span>
            </div>
          )}
          {client.phone && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground group/phone">
              <Phone className="h-3 w-3 shrink-0 group-hover/phone:text-primary transition-colors" />
              {client.phone}
            </div>
          )}
        </div>

        {/* Métricas */}
        {(client.next_appointment || client.total_sales || client.created_at) && (
          <div className="pt-2.5 border-t border-border/40 dark:border-zinc-800/50 space-y-1.5">
            {/* Próximo Agendamento */}
            {client.next_appointment && (
              <div className="flex items-center gap-1.5 text-xs">
                <div className="p-1 rounded bg-blue-500/10 dark:bg-blue-500/20">
                  <Calendar className="h-3 w-3 text-blue-500" />
                </div>
                <span className="text-muted-foreground">
                  {format(new Date(client.next_appointment), "dd/MM 'às' HH:mm", { locale: ptBR })}
                </span>
              </div>
            )}

            {/* Vendas */}
            {client.total_sales !== undefined && client.total_sales > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <div className="p-1 rounded bg-emerald-500/10 dark:bg-emerald-500/20">
                  <DollarSign className="h-3 w-3 text-emerald-500" />
                </div>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {client.total_sales} venda{client.total_sales > 1 ? "s" : ""} · R${" "}
                  {(client.total_revenue || 0).toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            )}

            {/* Tempo no Funil */}
            {client.created_at && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3 shrink-0 opacity-60" />
                <span className="opacity-80">
                  Há {formatDistanceToNow(new Date(client.created_at), { locale: ptBR })}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Tags */}
        {client.tags && client.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-2">
            {client.tags.slice(0, 3).map((tag, idx) => (
              <Badge 
                key={idx} 
                variant="outline" 
                className="text-[10px] px-1.5 py-0 h-5 bg-transparent border-border/60 dark:border-zinc-700/50 hover:bg-muted/50 transition-colors"
              >
                {tag}
              </Badge>
            ))}
            {client.tags.length > 3 && (
              <Badge 
                variant="outline" 
                className="text-[10px] px-1.5 py-0 h-5 bg-muted/30 dark:bg-zinc-800/30"
              >
                +{client.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
      </div>
    </Card>
  );
});

DraggableClientCard.displayName = "DraggableClientCard";

export default DraggableClientCard;

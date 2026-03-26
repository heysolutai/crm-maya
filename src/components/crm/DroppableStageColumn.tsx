import { useDroppable } from '@dnd-kit/core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import DraggableClientCard from './DraggableClientCard';

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
  stage_id?: string;
}

interface FunnelStage {
  id: string;
  name: string;
  color: string;
}

interface DroppableStageColumnProps {
  stage: FunnelStage;
  clients: ClientWithStage[];
  stages?: FunnelStage[];
  onClientClick?: (clientId: string) => void;
  onEditClient?: (client: ClientWithStage) => void;
  onDeleteClient?: (clientId: string) => void;
  onMoveClient?: (clientId: string, stageId: string) => void;
}

export function DroppableStageColumn({ 
  stage, 
  clients, 
  stages = [],
  onClientClick,
  onEditClient,
  onDeleteClient,
  onMoveClient,
}: DroppableStageColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
  });

  return (
    <div ref={setNodeRef} className="flex-shrink-0 w-96">
      <Card
        className={`
          overflow-hidden
          bg-gradient-to-b from-background via-background to-muted/20
          dark:from-zinc-900/50 dark:via-zinc-900/30 dark:to-zinc-950/50
          border border-border/50 dark:border-zinc-800/50
          transition-all duration-200
          ${isOver 
            ? 'ring-2 ring-offset-2 ring-offset-background dark:ring-offset-zinc-950 shadow-lg' 
            : 'hover:border-border dark:hover:border-zinc-700/60'
          }
        `}
        style={{
          borderColor: isOver ? stage.color : undefined,
          boxShadow: isOver ? `0 0 20px ${stage.color}30` : undefined,
        }}
      >
        {/* Header com gradiente baseado na cor do stage */}
        <CardHeader 
          className="pb-3 relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${stage.color}10 0%, transparent 100%)`,
          }}
        >
          {/* Glow sutil no header */}
          <div 
            className="absolute inset-0 opacity-30"
            style={{
              background: `radial-gradient(ellipse at top left, ${stage.color}20, transparent 70%)`,
            }}
          />
          
          <div className="relative flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2.5">
              <div
                className="w-3 h-3 rounded-full shadow-sm"
                style={{ 
                  backgroundColor: stage.color,
                  boxShadow: `0 0 10px ${stage.color}50, 0 0 0 2px ${stage.color}40`,
                }}
              />
              <span className="text-foreground">{stage.name}</span>
            </CardTitle>
            <Badge 
              variant="secondary" 
              className="h-6 min-w-[2rem] justify-center text-xs font-medium bg-muted/60 dark:bg-zinc-800/60 text-muted-foreground"
            >
              {clients.length}
            </Badge>
          </div>
        </CardHeader>

      <CardContent className="pt-1 flex-1 min-h-0">
        <ScrollArea className="h-[420px]">
          <div className="space-y-3 pr-2">
              {clients.map((client) => (
                <DraggableClientCard 
                  key={client.id} 
                  client={client}
                  stages={stages}
                  onClick={onClientClick}
                  onEdit={onEditClient}
                  onDelete={onDeleteClient}
                  onMoveToStage={onMoveClient}
                />
              ))}
            </div>
          </ScrollArea>

          {clients.length === 0 && (
            <div className="text-center py-10 text-muted-foreground/60 text-sm">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-muted/30 dark:bg-zinc-800/30 flex items-center justify-center">
                <div 
                  className="w-4 h-4 rounded-full opacity-40"
                  style={{ backgroundColor: stage.color }}
                />
              </div>
              Nenhum cliente nesta etapa
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

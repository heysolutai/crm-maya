import { Wifi, WifiOff, RefreshCw, AlertCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type RealtimeStatus = 'connected' | 'connecting' | 'disconnected';

interface RealtimeStatusIndicatorProps {
  status: RealtimeStatus;
  usePolling: boolean;
  onRefresh: () => void;
}

export function RealtimeStatusIndicator({ status, usePolling, onRefresh }: RealtimeStatusIndicatorProps) {
  const getStatusConfig = () => {
    if (usePolling) {
      return {
        icon: AlertCircle,
        color: 'text-yellow-500',
        label: 'Modo degradado',
        description: 'SSE caiu — atualizando a cada 5s ate reconectar'
      };
    }

    switch (status) {
      case 'connected':
        return {
          icon: Wifi,
          color: 'text-green-500',
          label: 'Conectado',
          description: 'Tempo real ativo'
        };
      case 'connecting':
        return {
          icon: RefreshCw,
          color: 'text-blue-500',
          label: 'Conectando...',
          description: 'Estabelecendo conexão'
        };
      case 'disconnected':
        return {
          icon: WifiOff,
          color: 'text-red-500',
          label: 'Desconectado',
          description: 'Reconectando...'
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onRefresh}
            className="flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent transition-colors"
          >
            <Icon 
              className={cn(
                "h-4 w-4",
                config.color,
                status === 'connecting' && "animate-spin"
              )} 
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="font-medium">{config.label}</p>
          <p className="text-xs text-muted-foreground">{config.description}</p>
          <p className="text-xs text-muted-foreground mt-1">Clique para atualizar</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
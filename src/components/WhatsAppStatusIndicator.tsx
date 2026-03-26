import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWhatsAppStatus, WhatsAppStatus } from '@/hooks/useWhatsAppStatus';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { 
  MessageCircle, 
  Loader2, 
  WifiOff, 
  Wifi, 
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';

const statusConfig: Record<WhatsAppStatus, {
  color: string;
  bgColor: string;
  icon: React.ReactNode;
  label: string;
  description: string;
}> = {
  connected: {
    color: 'text-green-500',
    bgColor: 'bg-green-500',
    icon: <Wifi className="h-3 w-3" />,
    label: 'WhatsApp Conectado',
    description: 'A integração está funcionando normalmente.',
  },
  connecting: {
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    label: 'Conectando...',
    description: 'Aguardando leitura do QR Code ou reconexão.',
  },
  disconnected: {
    color: 'text-red-500',
    bgColor: 'bg-red-500',
    icon: <WifiOff className="h-3 w-3" />,
    label: 'WhatsApp Desconectado',
    description: 'Clique para ir às Configurações e reconectar.',
  },
  error: {
    color: 'text-red-500',
    bgColor: 'bg-red-500',
    icon: <AlertCircle className="h-3 w-3" />,
    label: 'Erro na Conexão',
    description: 'Ocorreu um erro. Tente reconectar nas Configurações.',
  },
  no_instance: {
    color: 'text-muted-foreground',
    bgColor: 'bg-muted-foreground',
    icon: <MessageCircle className="h-3 w-3" />,
    label: 'WhatsApp não configurado',
    description: 'Configure sua integração nas Configurações.',
  },
};

export function WhatsAppStatusIndicator() {
  const router = useRouter();
  const { status, instance, isLoading, isSyncing, sync } = useWhatsAppStatus();
  const [isHovering, setIsHovering] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-2 py-1">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const config = statusConfig[status];

  const handleClick = () => {
    if (status !== 'connected') {
      router.push('/app/settings');
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "flex items-center gap-2 px-2 py-1 h-8 transition-all",
              status !== 'connected' && "hover:bg-destructive/10"
            )}
            onClick={handleClick}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            {/* Status dot with pulse animation for connecting */}
            <span className="relative flex h-2.5 w-2.5">
              {status === 'connecting' && (
                <span className={cn(
                  "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                  config.bgColor
                )} />
              )}
              <span className={cn(
                "relative inline-flex h-2.5 w-2.5 rounded-full",
                config.bgColor
              )} />
            </span>

            {/* Icon */}
            <span className={cn("flex items-center", config.color)}>
              {config.icon}
            </span>

            {/* Instance name or status text (hidden on mobile) */}
            <span className={cn(
              "hidden sm:inline text-xs font-medium",
              status === 'connected' ? 'text-foreground' : config.color
            )}>
              {status === 'connected'
                ? (instance?.instance_name || 'WhatsApp')
                : status === 'no_instance'
                ? 'Configurar'
                : config.label.replace('WhatsApp ', '')}
            </span>

            {/* Sync button on hover when connected */}
            {isHovering && status === 'connected' && (
              <RefreshCw 
                className={cn(
                  "h-3 w-3 text-muted-foreground hover:text-foreground transition-colors",
                  isSyncing && "animate-spin"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  sync();
                }}
              />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium">{config.label}</p>
            <p className="text-xs text-muted-foreground">{config.description}</p>
            {instance?.instance_name && (
              <p className="text-xs text-muted-foreground">
                Instância: {instance.instance_name}
              </p>
            )}
            {isSyncing && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Sincronizando...
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

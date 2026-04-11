'use client';

import { Bell, BellOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface PushNotificationsToggleProps {
  variant?: 'compact' | 'full';
  className?: string;
}

export function PushNotificationsToggle({
  variant = 'compact',
  className,
}: PushNotificationsToggleProps) {
  const {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
  } = usePushNotifications();

  if (!isSupported) {
    return variant === 'compact' ? null : (
      <div className={cn('text-xs text-muted-foreground', className)}>
        Notificações não suportadas neste navegador
      </div>
    );
  }

  const handleToggle = async () => {
    if (isSubscribed) {
      const res = await unsubscribe();
      if (res.ok) {
        toast({ title: 'Notificações desativadas' });
      }
      return;
    }

    if (permission === 'denied') {
      toast({
        title: 'Permissão bloqueada',
        description: 'Ative nas configurações do navegador.',
        variant: 'destructive',
      });
      return;
    }

    const res = await subscribe();
    if (res.ok) {
      toast({
        title: 'Notificações ativadas',
        description: 'Você receberá alertas de novas mensagens.',
      });
    } else {
      toast({
        title: 'Erro ao ativar',
        description: res.error,
        variant: 'destructive',
      });
    }
  };

  if (variant === 'compact') {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn('h-8 w-8 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent', className)}
        onClick={handleToggle}
        disabled={isLoading}
        aria-label={isSubscribed ? 'Desativar notificações' : 'Ativar notificações'}
        title={isSubscribed ? 'Notificações ativas' : 'Ativar notificações'}
      >
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isSubscribed ? (
          <Bell className="h-3.5 w-3.5 text-primary" />
        ) : (
          <BellOff className="h-3.5 w-3.5" />
        )}
      </Button>
    );
  }

  return (
    <div className={cn('flex items-center justify-between rounded-xl border border-border/60 bg-card p-4', className)}>
      <div className="flex items-center gap-3">
        {isSubscribed ? (
          <Bell className="h-5 w-5 text-primary" />
        ) : (
          <BellOff className="h-5 w-5 text-muted-foreground" />
        )}
        <div>
          <p className="text-sm font-medium">Notificações push</p>
          <p className="text-xs text-muted-foreground">
            {isSubscribed
              ? 'Recebendo alertas de novas mensagens'
              : permission === 'denied'
                ? 'Bloqueadas — ative no navegador'
                : 'Receba alertas mesmo com o app fechado'}
          </p>
        </div>
      </div>
      <Button
        variant={isSubscribed ? 'outline' : 'default'}
        size="sm"
        onClick={handleToggle}
        disabled={isLoading || permission === 'denied'}
      >
        {isLoading && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
        {isSubscribed ? 'Desativar' : 'Ativar'}
      </Button>
    </div>
  );
}

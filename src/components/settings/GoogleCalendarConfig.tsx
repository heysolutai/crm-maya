import { useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Video, RefreshCw, Unlink, Loader2 } from 'lucide-react';

export function GoogleCalendarConfig() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const {
    connection,
    isLoading,
    isConnected,
    connect,
    isConnecting,
    disconnect,
    isDisconnecting,
    updateSettings,
    isUpdating,
    refetch,
  } = useGoogleCalendar();

  // Processar resultado do callback OAuth
  useEffect(() => {
    const googleCalendarResult = searchParams.get('google_calendar');
    
    if (googleCalendarResult === 'success') {
      toast({
        title: '✅ Google Calendar conectado!',
        description: 'Sua conta do Google Calendar foi vinculada com sucesso',
      });
      refetch();
      // Limpar parâmetros da URL
      router.replace(pathname);
    } else if (googleCalendarResult === 'error') {
      const rawMessage = searchParams.get('message') || 'Erro desconhecido';
      // Sanitize: strip HTML tags and limit length to prevent XSS
      const message = rawMessage.replace(/<[^>]*>/g, '').slice(0, 200);
      toast({
        title: 'Erro ao conectar Google Calendar',
        description: `Falha na conexão: ${message}`,
        variant: 'destructive',
      });
      router.replace(pathname);
    }
  }, [searchParams, router, pathname, toast, refetch]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="h-6 w-6 text-primary" />
            <div>
              <CardTitle>Google Calendar</CardTitle>
              <CardDescription>
                Sincronize agendamentos automaticamente com o Google Calendar
              </CardDescription>
            </div>
          </div>
          {isConnected && (
            <Badge variant="default" className="text-xs">
              🟢 Conectado
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!isConnected ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <div className="text-center">
              <Calendar className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-4">
                Conecte sua conta Google para sincronizar agendamentos automaticamente.
                <br />
                Um calendário exclusivo será criado para sua empresa.
              </p>
            </div>
            <Button 
              onClick={() => connect()} 
              disabled={isConnecting}
              size="lg"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Conectando...
                </>
              ) : (
                <>
                  <Calendar className="h-4 w-4 mr-2" />
                  Conectar Google Calendar
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Informações da conexão */}
            <div className="p-4 bg-muted/50 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Conta:</span>
                <span className="font-medium">{connection?.connected_email || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Calendário:</span>
                <span className="font-medium">{connection?.calendar_name}</span>
              </div>
            </div>

            {/* Configurações */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="sync-enabled" className="font-medium">
                    Sincronização automática
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Criar eventos automaticamente ao agendar
                  </p>
                </div>
                <Switch
                  id="sync-enabled"
                  checked={connection?.sync_enabled ?? true}
                  onCheckedChange={(checked) => updateSettings({ sync_enabled: checked })}
                  disabled={isUpdating}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="meet-links" className="font-medium flex items-center gap-2">
                    <Video className="h-4 w-4" />
                    Google Meet
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Criar link do Meet automaticamente nos eventos
                  </p>
                </div>
                <Switch
                  id="meet-links"
                  checked={connection?.create_meet_links ?? false}
                  onCheckedChange={(checked) => updateSettings({ create_meet_links: checked })}
                  disabled={isUpdating}
                />
              </div>
            </div>

            {/* Ações */}
            <div className="flex gap-2 pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => disconnect()}
                disabled={isDisconnecting}
              >
                {isDisconnecting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Unlink className="h-4 w-4 mr-2" />
                )}
                Desconectar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

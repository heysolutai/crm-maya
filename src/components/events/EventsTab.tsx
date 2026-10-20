'use client';

import { useState } from 'react';
import { CalendarDays, ImageIcon, PartyPopper, Plus, RefreshCw, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Switch } from '@/components/ui/switch';
import { CardListSkeleton } from '@/components/ui/table-skeleton';
import { useEvents, useToggleEvent, type EventItem } from '@/hooks/useEvents';
import { EventEditor } from './EventEditor';

export function formatEventDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
}

export function EventsTab() {
  const { data, isLoading, isError, refetch, isFetching } = useEvents();
  const toggle = useToggleEvent();
  const [editing, setEditing] = useState<EventItem | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const abrir = (event: EventItem | null) => {
    setEditing(event);
    setEditorOpen(true);
  };

  const alternar = (event: EventItem, isActive: boolean) => {
    toggle.mutate(
      { id: event.id, isActive },
      {
        onSuccess: () => toast.success(isActive ? 'Evento ligado' : 'Evento desligado'),
        onError: (error) => toast.error(error.message),
      }
    );
  };

  if (isLoading) return <CardListSkeleton count={3} />;

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">Não foi possível carregar os eventos.</p>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Tentar de novo
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Os eventos ligados são os que a IA conta para os clientes e para os quais anota inscrições.
        </p>
        <Button onClick={() => abrir(null)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo evento
        </Button>
      </div>

      {data.length === 0 ? (
        <EmptyState
          icon={PartyPopper}
          title="Nenhum evento ainda"
          description="Cadastre um evento especial e a IA passa a divulgar e anotar quem quer ir."
          actionLabel="Novo evento"
          onAction={() => abrir(null)}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((event) => (
            <Card key={event.id} className={event.isActive ? '' : 'opacity-70'}>
              <CardContent className="space-y-3 p-4">
                <button
                  type="button"
                  onClick={() => abrir(event)}
                  className="flex w-full items-start gap-3 text-left"
                  aria-label={`Editar ${event.name}`}
                >
                  {event.imageUrls[0] ? (
                    <img src={event.imageUrls[0]} alt="" className="h-20 w-20 shrink-0 rounded-md object-cover" />
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-muted">
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <h3 className="break-words font-semibold leading-tight">{event.name}</h3>
                    {event.eventDate && (
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                        {formatEventDate(event.eventDate)}
                      </p>
                    )}
                    {event.priceInfo && <p className="line-clamp-2 text-sm text-muted-foreground">{event.priceInfo}</p>}
                  </div>
                </button>
                <div className="flex items-center justify-between gap-3 border-t pt-3">
                  <p className="flex items-center gap-1.5 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    {event.registrationsCount} inscrito{event.registrationsCount === 1 ? '' : 's'}
                    {event.capacity ? ` · ${event.guestsCount} de ${event.capacity} vagas` : ''}
                  </p>
                  <label className="flex items-center gap-2 text-sm">
                    {event.isActive ? 'Ligado' : 'Desligado'}
                    <Switch
                      checked={event.isActive}
                      onCheckedChange={(v) => alternar(event, v)}
                      aria-label={event.isActive ? 'Desligar evento' : 'Ligar evento'}
                    />
                  </label>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <EventEditor open={editorOpen} onOpenChange={setEditorOpen} event={editing} />
    </div>
  );
}

'use client';

import { useState, useMemo } from 'react';
import { useReservations, type CreateReservationData } from '@/hooks/useReservations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CalendarCheck, Plus, Users, Clock, Loader2, UtensilsCrossed, CheckCircle2, XCircle, Ban,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  confirmed: { label: 'Confirmada', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  no_show: { label: 'No-show', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  cancelled: { label: 'Cancelada', cls: 'bg-muted text-muted-foreground' },
};
const SOURCE_META: Record<string, { label: string; cls: string }> = {
  ai: { label: 'IA', cls: 'bg-primary/15 text-primary' },
  agent: { label: 'Atendente', cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  manual: { label: 'Manual', cls: 'bg-muted text-muted-foreground' },
};

const FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'confirmed', label: 'Confirmadas' },
  { key: 'no_show', label: 'No-show' },
  { key: 'cancelled', label: 'Canceladas' },
];

const EMPTY_FORM: CreateReservationData = { customerName: '', partySize: 2, reservedFor: '', notes: '' };

export default function Reservations() {
  const { reservations, isLoading, createReservation, isCreating, updateReservation } = useReservations();
  const [filter, setFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CreateReservationData>(EMPTY_FORM);

  const filtered = useMemo(
    () => (filter === 'all' ? reservations : reservations.filter((r) => r.status === filter)),
    [reservations, filter]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: reservations.length };
    for (const r of reservations) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [reservations]);

  const handleCreate = () => {
    if (!form.customerName?.trim()) return;
    createReservation(
      {
        customerName: form.customerName.trim(),
        partySize: form.partySize || null,
        reservedFor: form.reservedFor ? new Date(form.reservedFor).toISOString() : null,
        notes: form.notes?.trim() || null,
        status: 'confirmed',
      },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setForm(EMPTY_FORM);
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <CalendarCheck className="h-7 w-7 text-primary" />
            Reservas
          </h1>
          <p className="text-muted-foreground mt-1">
            Reservas do seu restaurante — feitas pela IA ou manualmente.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Nova reserva
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova reserva</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="cust">Nome do cliente</Label>
                <Input
                  id="cust"
                  placeholder="Ex: João Silva"
                  value={form.customerName || ''}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="party">Nº de pessoas</Label>
                  <Input
                    id="party"
                    type="number"
                    min={1}
                    value={form.partySize ?? ''}
                    onChange={(e) => setForm({ ...form, partySize: e.target.value ? parseInt(e.target.value) : null })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="when">Data e hora</Label>
                  <Input
                    id="when"
                    type="datetime-local"
                    value={form.reservedFor || ''}
                    onChange={(e) => setForm({ ...form, reservedFor: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Observações (opcional)</Label>
                <Textarea
                  id="notes"
                  rows={2}
                  placeholder="Ex: mesa perto da janela, aniversário..."
                  value={form.notes || ''}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={!form.customerName?.trim() || isCreating}>
                {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar reserva
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
              filter === f.key
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border/60 text-muted-foreground hover:border-primary/40'
            )}
          >
            {f.label}
            {counts[f.key] ? <span className="ml-1.5 opacity-70">{counts[f.key]}</span> : null}
          </button>
        ))}
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title="Nenhuma reserva ainda"
          description="Quando a IA registrar uma reserva pelo WhatsApp — ou você criar uma manual — ela aparece aqui."
          actionLabel="Nova reserva"
          onAction={() => setDialogOpen(true)}
        />
      ) : (
        <div className="grid gap-3">
          {filtered.map((r) => {
            const st = STATUS_META[r.status] || STATUS_META.cancelled;
            const src = SOURCE_META[r.source] || SOURCE_META.manual;
            return (
              <div key={r.id} className="rounded-2xl border border-border/60 bg-card p-4 flex items-center gap-4 flex-wrap">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <CalendarCheck className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold truncate">{r.customerName || 'Cliente'}</p>
                    <Badge variant="secondary" className={cn('border-0', src.cls)}>{src.label}</Badge>
                    <Badge variant="secondary" className={cn('border-0', st.cls)}>{st.label}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                    {r.partySize ? (
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" /> {r.partySize} {r.partySize === 1 ? 'pessoa' : 'pessoas'}
                      </span>
                    ) : null}
                    {r.reservedFor ? (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> {format(new Date(r.reservedFor), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </span>
                    ) : null}
                  </div>
                  {r.notes ? <p className="text-xs text-muted-foreground mt-1 truncate">{r.notes}</p> : null}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {r.status !== 'confirmed' && (
                    <Button variant="ghost" size="sm" onClick={() => updateReservation({ id: r.id, status: 'confirmed' })} title="Confirmar">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    </Button>
                  )}
                  {r.status !== 'no_show' && (
                    <Button variant="ghost" size="sm" onClick={() => updateReservation({ id: r.id, status: 'no_show' })} title="Marcar no-show">
                      <XCircle className="h-4 w-4 text-amber-600" />
                    </Button>
                  )}
                  {r.status !== 'cancelled' && (
                    <Button variant="ghost" size="sm" onClick={() => updateReservation({ id: r.id, status: 'cancelled' })} title="Cancelar">
                      <Ban className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

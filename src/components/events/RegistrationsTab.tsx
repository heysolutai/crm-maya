'use client';

import { useMemo, useState } from 'react';
import { Download, Loader2, Plus, RefreshCw, Search, Undo2, Users, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CardListSkeleton } from '@/components/ui/table-skeleton';
import {
  useAddRegistration,
  useEvents,
  useRegistrations,
  useSetRegistrationStatus,
  type RegistrationItem,
} from '@/hooks/useEvents';
import { cn } from '@/lib/utils';

const TODOS = 'todos';

function dataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function origem(source: string): string {
  return source === 'manual' ? 'Anotado por você' : 'Pela IA';
}

function celulaCsv(valor: string | number | null | undefined): string {
  const texto = String(valor ?? '').replace(/\r?\n/g, ' ');
  // Evita que o Excel trate o texto como fórmula.
  const seguro = /^[=+\-@]/.test(texto) ? `'${texto}` : texto;
  return `"${seguro.replace(/"/g, '""')}"`;
}

function baixarPlanilha(lista: RegistrationItem[]) {
  const cabecalho = ['Evento', 'Nome', 'Telefone', 'Pessoas', 'Observações', 'Como entrou', 'Data', 'Situação'];
  const linhas = lista.map((r) => [
    r.eventName,
    r.name,
    r.phone,
    r.guests ?? 1,
    r.notes,
    origem(r.source),
    dataHora(r.createdAt),
    r.status === 'cancelled' ? 'Cancelada' : 'Confirmada',
  ]);
  const csv = [cabecalho, ...linhas].map((l) => l.map(celulaCsv).join(';')).join('\r\n');
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'inscritos.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function AdicionarInscrito({
  open,
  onOpenChange,
  defaultEventId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultEventId: string;
}) {
  const { data: events } = useEvents();
  const add = useAddRegistration();
  const [eventId, setEventId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [guests, setGuests] = useState('1');
  const [notes, setNotes] = useState('');

  const aoMudar = (v: boolean) => {
    if (v) {
      setEventId(defaultEventId !== TODOS ? defaultEventId : events?.[0]?.id ?? '');
      setName('');
      setPhone('');
      setGuests('1');
      setNotes('');
    }
    onOpenChange(v);
  };

  const salvar = () => {
    if (!eventId) {
      toast.error('Escolha o evento.');
      return;
    }
    if (!name.trim()) {
      toast.error('Informe o nome.');
      return;
    }
    const pessoas = Number.parseInt(guests, 10);
    add.mutate(
      {
        eventId,
        name: name.trim(),
        phone: phone.trim() || null,
        guests: Number.isFinite(pessoas) && pessoas > 0 ? pessoas : 1,
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success('Inscrito adicionado');
          onOpenChange(false);
        },
        onError: (error) => toast.error(error.message),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={aoMudar}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar inscrito</DialogTitle>
          <DialogDescription>Anote alguém que combinou com você fora do WhatsApp.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Evento</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha o evento" />
              </SelectTrigger>
              <SelectContent>
                {(events ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="insc-nome">Nome *</Label>
            <Input id="insc-nome" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="insc-tel">Telefone</Label>
              <Input
                id="insc-tel"
                inputMode="tel"
                value={phone}
                maxLength={40}
                placeholder="(11) 99999-9999"
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="insc-pessoas">Quantas pessoas</Label>
              <Input
                id="insc-pessoas"
                inputMode="numeric"
                value={guests}
                onChange={(e) => setGuests(e.target.value.replace(/\D/g, '').slice(0, 4))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="insc-obs">Observações</Label>
            <Textarea
              id="insc-obs"
              rows={3}
              value={notes}
              maxLength={2000}
              placeholder="Ex.: uma pessoa é alérgica a camarão"
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={add.isPending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={add.isPending}>
            {add.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RegistrationsTab() {
  const { data: events } = useEvents();
  const [eventId, setEventId] = useState(TODOS);
  const [busca, setBusca] = useState('');
  const [adicionando, setAdicionando] = useState(false);
  const [cancelando, setCancelando] = useState<RegistrationItem | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useRegistrations({
    eventId: eventId === TODOS ? undefined : eventId,
  });
  const setStatus = useSetRegistrationStatus();

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!data) return [];
    if (!q) return data;
    return data.filter((r) => r.name.toLowerCase().includes(q) || (r.phone ?? '').toLowerCase().includes(q));
  }, [data, busca]);

  const confirmadas = lista.filter((r) => r.status !== 'cancelled');
  const totalPessoas = confirmadas.reduce((soma, r) => soma + (r.guests ?? 1), 0);

  const cancelar = () => {
    if (!cancelando) return;
    setStatus.mutate(
      { id: cancelando.id, status: 'cancelled' },
      {
        onSuccess: () => {
          toast.success('Inscrição cancelada');
          setCancelando(null);
        },
        onError: (error) => toast.error(error.message),
      }
    );
  };

  const reativar = (r: RegistrationItem) => {
    setStatus.mutate(
      { id: r.id, status: 'confirmed' },
      {
        onSuccess: () => toast.success('Inscrição de volta'),
        onError: (error) => toast.error(error.message),
      }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={eventId} onValueChange={setEventId}>
          <SelectTrigger className="sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os eventos</SelectItem>
            {(events ?? []).map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou telefone"
            className="pl-9"
            aria-label="Buscar inscrito"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => baixarPlanilha(lista)} disabled={lista.length === 0} className="flex-1 sm:flex-none">
            <Download className="mr-2 h-4 w-4" />
            Baixar planilha
          </Button>
          <Button onClick={() => setAdicionando(true)} disabled={!events || events.length === 0} className="flex-1 sm:flex-none">
            <Plus className="mr-2 h-4 w-4" />
            Adicionar inscrito
          </Button>
        </div>
      </div>

      {isLoading ? (
        <CardListSkeleton count={4} />
      ) : isError || !data ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">Não foi possível carregar os inscritos.</p>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Tentar de novo
          </Button>
        </div>
      ) : lista.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum inscrito"
          description={
            busca ? 'Ninguém encontrado com essa busca.' : 'Quando a IA anotar alguém num evento, aparece aqui.'
          }
        />
      ) : (
        <>
          <p className="text-sm font-medium">
            {confirmadas.length} inscrito{confirmadas.length === 1 ? '' : 's'} · {totalPessoas} pessoa
            {totalPessoas === 1 ? '' : 's'}
          </p>
          <div className="space-y-3">
            {lista.map((r) => {
              const cancelada = r.status === 'cancelled';
              return (
                <Card key={r.id} className={cn(cancelada && 'bg-muted/40 opacity-60')}>
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className={cn('break-words font-semibold', cancelada && 'line-through')}>{r.name}</h3>
                        {cancelada && <Badge variant="secondary">Cancelada</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {r.eventName} · {r.guests ?? 1} pessoa{(r.guests ?? 1) === 1 ? '' : 's'}
                        {r.phone ? ` · ${r.phone}` : ''}
                      </p>
                      {r.notes && <p className="whitespace-pre-line break-words text-sm">{r.notes}</p>}
                      <p className="text-xs text-muted-foreground">
                        {origem(r.source)} · {dataHora(r.createdAt)}
                      </p>
                    </div>
                    {cancelada ? (
                      <Button variant="outline" size="sm" onClick={() => reativar(r)} disabled={setStatus.isPending}>
                        <Undo2 className="mr-2 h-4 w-4" />
                        Voltar inscrição
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setCancelando(r)} disabled={setStatus.isPending}>
                        <XCircle className="mr-2 h-4 w-4" />
                        Cancelar inscrição
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <AdicionarInscrito open={adicionando} onOpenChange={setAdicionando} defaultEventId={eventId} />

      <ConfirmDialog
        open={!!cancelando}
        onOpenChange={(v) => !v && setCancelando(null)}
        title="Cancelar esta inscrição?"
        description={cancelando ? `${cancelando.name} deixa de contar nas vagas do evento. Você pode desfazer depois.` : ''}
        confirmLabel="Cancelar inscrição"
        cancelLabel="Voltar"
        variant="destructive"
        isLoading={setStatus.isPending}
        onConfirm={cancelar}
      />
    </div>
  );
}

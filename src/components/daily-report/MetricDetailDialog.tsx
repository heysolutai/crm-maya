import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, User, Calendar, Phone, ArrowLeft, Search, Check, UserPlus, DollarSign, Clock, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase/client';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';
import { useAuth } from '@/hooks/useAuth';
import { useClients } from '@/hooks/useClients';
import { useToast } from '@/hooks/use-toast';

export type MetricType = 'entrantes' | 'agendaram' | 'agendados' | 'compareceram' | 'walk_in' | 'vendas' | 'total_vendas';

interface MetricDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: MetricType;
  clients?: any[];
  appointments?: any[];
  sales?: any[];
  scheduledForToday?: any[];
  onRefresh?: () => void;
}

const titles: Record<MetricType, string> = {
  entrantes: 'Leads Entrantes',
  agendaram: 'Agendaram Hoje',
  agendados: 'Agendados para Hoje',
  compareceram: 'Compareceram',
  walk_in: 'Compareceu sem Agendar',
  vendas: 'Vendas do Dia',
  total_vendas: 'Total em Vendas',
};

function getClientName(item: any) {
  if (item?.clients?.full_name) return item.clients.full_name;
  if (item?.clients?.first_name) return `${item.clients.first_name} ${item.clients.last_name || ''}`.trim();
  if (item?.full_name) return item.full_name;
  if (item?.first_name) return `${item.first_name} ${item.last_name || ''}`.trim();
  if (item?.patient_name) return item.patient_name;
  return 'Sem nome';
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function MetricDetailDialog({
  open, onOpenChange, type, clients = [], appointments = [], sales = [], scheduledForToday = [], onRefresh,
}: MetricDetailDialogProps) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addTab, setAddTab] = useState<'suggestions' | 'existing' | 'new'>('suggestions');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [saleProduct, setSaleProduct] = useState('');
  const [saleValue, setSaleValue] = useState('');
  const [appointmentDate, setAppointmentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [appointmentTime, setAppointmentTime] = useState(format(new Date(), 'HH:mm'));
  const [saving, setSaving] = useState(false);

  const { effectiveCompanyId } = useEffectiveCompanyId();
  const { user } = useAuth();
  const { clients: allClients } = useClients();
  const { toast } = useToast();

  const needsAppointmentFields = type === 'agendaram' || type === 'agendados' || type === 'compareceram' || type === 'walk_in';
  const buildScheduledFor = () => `${appointmentDate}T${appointmentTime}:00-03:00`;

  const hasSuggestions = (type === 'compareceram' || type === 'walk_in' || type === 'vendas' || type === 'total_vendas') && scheduledForToday.length > 0;
  const hasComparecidos = scheduledForToday.some((a: any) => a.status === 'completed');

  const resetForm = () => {
    setShowAddForm(false);
    setAddTab(hasSuggestions ? 'suggestions' : 'existing');
    setSearchQuery('');
    setSelectedClientId(null);
    setNewName('');
    setNewPhone('');
    setSaleProduct('');
    setSaleValue('');
    setAppointmentDate(format(new Date(), 'yyyy-MM-dd'));
    setAppointmentTime(format(new Date(), 'HH:mm'));
    setSaving(false);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) resetForm();
    onOpenChange(v);
  };

  const handleDeleteAppointment = async (id: string) => {
    setDeleting(id);
    try {
      const { error } = await supabase.from('appointments').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Agendamento excluído!' });
      onRefresh?.();
    } catch (e: any) {
      toast({ title: 'Erro ao excluir', description: e.message, variant: 'destructive' });
    } finally {
      setDeleting(null);
    }
  };

  const filteredClients = allClients.filter(c => {
    const name = `${c.first_name} ${c.last_name || ''} ${c.full_name || ''}`.toLowerCase();
    const phone = c.phone || '';
    const q = searchQuery.toLowerCase();
    return name.includes(q) || phone.includes(q);
  });

  const handleAddExisting = async () => {
    if (!selectedClientId || !effectiveCompanyId) return;
    setSaving(true);
    try {
      if (type === 'entrantes') {
        await supabase.from('clients').update({ source: 'manual_report' }).eq('id', selectedClientId);
      }
      if (type === 'agendaram' || type === 'agendados') {
        const { error } = await supabase.from('appointments').insert({
          client_id: selectedClientId,
          company_id: effectiveCompanyId,
          title: 'Agendamento manual',
          scheduled_for: buildScheduledFor(),
          status: 'scheduled',
          created_by: user?.id,
        });
        if (error) throw error;
      }
      if (type === 'compareceram') {
        // Mark the appointment as completed
        const apt = scheduledForToday.find((a: any) => a.client_id === selectedClientId || a.clients?.id === selectedClientId);
        if (apt) {
          await supabase.from('appointments').update({ status: 'completed' }).eq('id', apt.id);
        } else {
          // Create a completed appointment (marked to avoid inflating agendaram count)
          const { error } = await supabase.from('appointments').insert({
            client_id: selectedClientId,
            company_id: effectiveCompanyId,
            title: 'Comparecimento manual',
            scheduled_for: buildScheduledFor(),
            status: 'completed',
            notes: 'comparecimento',
            created_by: user?.id,
          });
          if (error) throw error;
        }
      }
      if (type === 'walk_in') {
        // Create a completed appointment without prior scheduling
        const { error } = await supabase.from('appointments').insert({
          client_id: selectedClientId,
          company_id: effectiveCompanyId,
          title: 'Compareceu sem agendar',
          scheduled_for: buildScheduledFor(),
          status: 'completed',
          notes: 'walk-in',
          created_by: user?.id,
        });
        if (error) throw error;
      }
      if (type === 'vendas' || type === 'total_vendas') {
        const saleNumber = `V-${format(new Date(), 'yyyyMMdd')}-${Date.now().toString(36).toUpperCase()}`;
        const value = Number(saleValue) || 0;
        const { error } = await supabase.from('sales').insert({
          company_id: effectiveCompanyId,
          client_id: selectedClientId,
          sold_by: user?.id,
          sale_number: saleNumber,
          items: [{ name: saleProduct || 'Venda', quantity: 1, unit_price: value, total: value }],
          subtotal: value,
          status: 'approved',
        });
        if (error) throw error;
      }
      toast({ title: 'Adicionado com sucesso!' });
      onRefresh?.();
      resetForm();
    } catch (e: any) {
      toast({ title: 'Erro ao adicionar', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddFromSuggestion = async (appointment: any) => {
    if (!effectiveCompanyId) return;
    setSaving(true);
    try {
      const clientId = appointment.client_id || appointment.clients?.id;
      if (type === 'compareceram') {
        await supabase.from('appointments').update({ status: 'completed' }).eq('id', appointment.id);
      } else if (type === 'walk_in') {
        const { error } = await supabase.from('appointments').insert({
          client_id: clientId,
          company_id: effectiveCompanyId,
          title: 'Compareceu sem agendar',
          scheduled_for: new Date().toISOString(),
          status: 'completed',
          notes: 'walk-in',
          created_by: user?.id,
        });
        if (error) throw error;
      } else if (type === 'vendas' || type === 'total_vendas') {
        setSelectedClientId(clientId);
        setShowAddForm(true);
        setSaving(false);
        return;
      }
      toast({ title: 'Adicionado com sucesso!' });
      onRefresh?.();
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateNew = async () => {
    if (!newName.trim() || !effectiveCompanyId) return;
    setSaving(true);
    try {
      const nameParts = newName.trim().split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || undefined;

      // Use specific source to avoid inflating ENTRANTES count
      const clientSource = type === 'compareceram' ? 'comparecimento'
        : type === 'walk_in' ? 'walk_in'
        : 'manual_report';

      const { data: newClient, error } = await supabase.from('clients').insert({
        first_name: firstName,
        last_name: lastName,
        phone: newPhone || undefined,
        company_id: effectiveCompanyId,
        source: clientSource,
        created_by: user?.id,
      }).select('id').single();

      if (error) throw error;

      if ((type === 'agendaram' || type === 'agendados') && newClient) {
        await supabase.from('appointments').insert({
          client_id: newClient.id,
          company_id: effectiveCompanyId,
          title: 'Agendamento manual',
          scheduled_for: buildScheduledFor(),
          status: 'scheduled',
          created_by: user?.id,
        });
      }
      if ((type === 'compareceram' || type === 'walk_in') && newClient) {
        await supabase.from('appointments').insert({
          client_id: newClient.id,
          company_id: effectiveCompanyId,
          title: type === 'walk_in' ? 'Compareceu sem agendar' : 'Comparecimento manual',
          scheduled_for: buildScheduledFor(),
          status: 'completed',
          notes: type === 'walk_in' ? 'walk-in' : 'comparecimento',
          created_by: user?.id,
        });
      }
      if ((type === 'vendas' || type === 'total_vendas') && newClient) {
        const saleNumber = `V-${format(new Date(), 'yyyyMMdd')}-${Date.now().toString(36).toUpperCase()}`;
        const value = Number(saleValue) || 0;
        await supabase.from('sales').insert({
          company_id: effectiveCompanyId,
          client_id: newClient.id,
          sold_by: user?.id,
          sale_number: saleNumber,
          items: [{ name: saleProduct || 'Venda', quantity: 1, unit_price: value, total: value }],
          subtotal: value,
          status: 'approved',
        });
      }

      toast({ title: 'Contato criado e adicionado!' });
      onRefresh?.();
      resetForm();
    } catch (e: any) {
      toast({ title: 'Erro ao criar contato', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const canAdd = type === 'entrantes' || type === 'agendaram' || type === 'agendados' || type === 'compareceram' || type === 'walk_in' || ((type === 'vendas' || type === 'total_vendas') && hasComparecidos);
  const needsSaleFields = type === 'vendas' || type === 'total_vendas';

  const renderList = () => {
    if (type === 'entrantes') {
      if (clients.length === 0) return <EmptyState />;
      return clients.map((c: any) => (
        <ListItem key={c.id}>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{getClientName(c)}</p>
              {c.phone && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" />{c.phone}
                </p>
              )}
            </div>
          </div>
          {c.source && <Badge variant="outline" className="text-xs shrink-0">{c.source}</Badge>}
        </ListItem>
      ));
    }

    if (type === 'agendaram' || type === 'agendados' || type === 'compareceram') {
      let list = appointments;
      if (type === 'compareceram') {
        list = appointments.filter((a: any) => a.status === 'completed' && a.notes !== 'walk-in');
      } else if (type === 'agendados') {
        list = appointments.filter((a: any) => a.notes !== 'walk-in' && a.status !== 'completed');
      }
      if (list.length === 0) return <EmptyState />;
      return list.map((a: any) => (
        <ListItem key={a.id}>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Calendar className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{getClientName(a)}</p>
              <p className="text-xs text-muted-foreground">
                {a.scheduled_for ? format(new Date(a.scheduled_for), 'HH:mm') : '—'} • {a.title}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge
              variant={a.status === 'completed' ? 'default' : a.status === 'cancelled' ? 'destructive' : 'outline'}
              className="text-xs"
            >
              {a.status === 'completed' ? 'Compareceu' : a.status === 'cancelled' ? 'Cancelado' : 'Agendado'}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => handleDeleteAppointment(a.id)}
              disabled={deleting === a.id}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </ListItem>
      ));
    }

    if (type === 'walk_in') {
      const walkIns = appointments.filter((a: any) => a.status === 'completed' && a.notes === 'walk-in');
      if (walkIns.length === 0) return <EmptyState />;
      return walkIns.map((a: any) => (
        <ListItem key={a.id}>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{getClientName(a)}</p>
              <p className="text-xs text-muted-foreground">Sem agendamento prévio</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="default" className="text-xs">Walk-in</Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => handleDeleteAppointment(a.id)}
              disabled={deleting === a.id}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </ListItem>
      ));
    }

    if (type === 'vendas' || type === 'total_vendas') {
      if (sales.length === 0) return <EmptyState />;
      return sales.map((s: any) => (
        <ListItem key={s.id}>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{getClientName(s)}</p>
              <p className="text-xs text-muted-foreground">#{s.sale_number}</p>
            </div>
          </div>
          <span className="font-semibold text-sm text-primary shrink-0">
            {formatCurrency(Number(s.total_amount) || 0)}
          </span>
        </ListItem>
      ));
    }

    return <EmptyState />;
  };

  const renderSuggestions = () => {
    // Filter suggestions based on type
    let suggestions: any[];
    if (type === 'compareceram') {
      // For compareceram: show only non-completed/non-cancelled appointments
      suggestions = scheduledForToday.filter((a: any) => a.status !== 'completed' && a.status !== 'cancelled');
    } else if (type === 'vendas' || type === 'total_vendas') {
      // For vendas: show only completed appointments (people who attended)
      suggestions = scheduledForToday.filter((a: any) => a.status === 'completed');
    } else {
      suggestions = scheduledForToday;
    }

    if (suggestions.length === 0) {
      return (
        <div className="py-4 text-center text-sm text-muted-foreground">
          {needsSaleFields ? 'Nenhum comparecimento para registrar venda' : 'Nenhum agendado para sugerir'}
        </div>
      );
    }

    return (
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground mb-2">
          {needsSaleFields
            ? 'Pessoas que compareceram — clique para registrar venda:'
            : 'Pessoas agendadas para hoje — clique para confirmar:'}
        </p>
        {suggestions.map((a: any) => (
          <button
            key={a.id}
            onClick={() => handleAddFromSuggestion(a)}
            disabled={saving}
            className="w-full flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-primary/10 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Calendar className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{getClientName(a)}</p>
                <p className="text-xs text-muted-foreground">
                  {a.scheduled_for ? format(new Date(a.scheduled_for), 'HH:mm') : '—'} • {a.title}
                </p>
              </div>
            </div>
            {needsSaleFields
              ? <DollarSign className="h-4 w-4 text-primary shrink-0" />
              : <Check className="h-4 w-4 text-primary shrink-0" />}
          </button>
        ))}
      </div>
    );
  };

  const renderAddForm = () => {
    const showSuggestionsTab = hasSuggestions;
    const salesOnly = needsSaleFields; // vendas/total_vendas: only show suggestions (compareceram)
    const defaultTab = (showSuggestionsTab || salesOnly) ? 'suggestions' : 'existing';

    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="gap-1 -ml-2" onClick={resetForm}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>

        {salesOnly ? (
          // Vendas: only show compareceram list, no tabs
          <div>
            {selectedClientId ? (
              // Sale form for selected client
              <div className="space-y-3">
                <Button variant="ghost" size="sm" className="gap-1 -ml-2" onClick={() => setSelectedClientId(null)}>
                  <ArrowLeft className="h-4 w-4" /> Escolher outro
                </Button>
                <div className="space-y-2">
                  <Label className="text-xs">Produto/Serviço</Label>
                  <Input placeholder="Ex: Óculos, Consulta..." value={saleProduct} onChange={(e) => setSaleProduct(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Valor (R$) *</Label>
                  <Input type="number" placeholder="0.00" value={saleValue} onChange={(e) => setSaleValue(e.target.value)} />
                </div>
                <Button
                  onClick={handleAddExisting}
                  disabled={!saleValue || saving}
                  className="w-full"
                >
                  {saving ? 'Registrando...' : 'Registrar venda'}
                </Button>
              </div>
            ) : (
              // Show compareceram list to pick from
              <ScrollArea className="h-[350px]">
                {renderSuggestions()}
              </ScrollArea>
            )}
          </div>
        ) : (
          // Non-sales types: show full tabs
          <Tabs value={addTab} onValueChange={(v) => setAddTab(v as any)} defaultValue={defaultTab}>
            <TabsList className={`w-full ${showSuggestionsTab ? 'grid-cols-3' : ''}`}>
              {showSuggestionsTab && (
                <TabsTrigger value="suggestions" className="flex-1 gap-1">
                  <Calendar className="h-3.5 w-3.5" /> Sugestões
                </TabsTrigger>
              )}
              <TabsTrigger value="existing" className="flex-1 gap-1">
                <Search className="h-3.5 w-3.5" /> Existente
              </TabsTrigger>
              <TabsTrigger value="new" className="flex-1 gap-1">
                <UserPlus className="h-3.5 w-3.5" /> Novo
              </TabsTrigger>
            </TabsList>

            {showSuggestionsTab && (
              <TabsContent value="suggestions" className="mt-3">
                <ScrollArea className="h-[300px]">
                  {renderSuggestions()}
                </ScrollArea>
              </TabsContent>
            )}

            <TabsContent value="existing" className="space-y-3 mt-3">
              <Input
                placeholder="Buscar por nome ou telefone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <ScrollArea className="h-[200px]">
                <div className="space-y-1">
                  {filteredClients.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Nenhum contato encontrado</p>
                  ) : (
                    filteredClients.slice(0, 50).map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedClientId(c.id === selectedClientId ? null : c.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left ${
                          selectedClientId === c.id ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted/50'
                        }`}
                      >
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                          {selectedClientId === c.id ? (
                            <Check className="h-4 w-4 text-primary" />
                          ) : (
                            <User className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{c.first_name} {c.last_name || ''}</p>
                          {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
              {needsAppointmentFields && selectedClientId && (
                <div className="space-y-2 border-t pt-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1"><Calendar className="h-3 w-3" /> Data *</Label>
                      <Input type="date" value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> Hora *</Label>
                      <Input type="time" value={appointmentTime} onChange={(e) => setAppointmentTime(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}
              <Button
                onClick={handleAddExisting}
                disabled={!selectedClientId || saving}
                className="w-full"
              >
                {saving ? 'Adicionando...' : 'Adicionar selecionado'}
              </Button>
            </TabsContent>

            <TabsContent value="new" className="space-y-3 mt-3">
              <div className="space-y-2">
                <Label>Nome completo *</Label>
                <Input placeholder="Nome do contato" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input placeholder="5511999999999" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
              </div>
              {needsAppointmentFields && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Data *</Label>
                    <Input type="date" value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1"><Clock className="h-3 w-3" /> Hora *</Label>
                    <Input type="time" value={appointmentTime} onChange={(e) => setAppointmentTime(e.target.value)} />
                  </div>
                </div>
              )}
              <Button
                onClick={handleCreateNew}
                disabled={!newName.trim() || saving}
                className="w-full"
              >
                {saving ? 'Criando...' : 'Criar e adicionar'}
              </Button>
            </TabsContent>
          </Tabs>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{titles[type]}</span>
            {canAdd && !showAddForm && (
              <Button size="sm" variant="outline" onClick={() => { setShowAddForm(true); setAddTab(hasSuggestions ? 'suggestions' : 'existing'); }} className="gap-1">
                <Plus className="h-4 w-4" />
                Adicionar
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        {showAddForm ? (
          renderAddForm()
        ) : (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-1 pb-2">
              {renderList()}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ListItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">
      Nenhum registro encontrado.
    </div>
  );
}

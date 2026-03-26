import { useState, useEffect } from 'react';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle 
} from '@/components/ui/sheet';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Mail, 
  Phone, 
  Calendar, 
  DollarSign, 
  Clock, 
  ArrowRight,
  Trash2,
  FileText,
  User,
  MapPin,
  Pencil
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useClients, Client } from '@/hooks/useClients';
import { useClientNotes } from '@/hooks/useClientNotes';
import { useClientHistory } from '@/hooks/useClientHistory';
import { useFunnelStages } from '@/hooks/useFunnelStages';
import { ClientTagManager } from './ClientTagManager';
import { ClientFormDialog } from './ClientFormDialog';

interface ClientDetailSheetProps {
  clientId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ClientDetailSheet({ clientId, isOpen, onClose }: ClientDetailSheetProps) {
  const { clients, updateClient, fetchClients } = useClients();
  const { notes, loading: notesLoading, addNote, deleteNote } = useClientNotes(clientId);
  const { history, loading: historyLoading } = useClientHistory(clientId);
  const { stages } = useFunnelStages();
  
  const [newNote, setNewNote] = useState('');
  const [client, setClient] = useState<Client | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  useEffect(() => {
    if (clientId) {
      const foundClient = clients.find(c => c.id === clientId);
      setClient(foundClient || null);
    }
  }, [clientId, clients]);

  const currentStage = stages.find(s => s.id === client?.stage_id);

  const handleAddNote = async () => {
    const success = await addNote(newNote);
    if (success) {
      setNewNote('');
    }
  };

  const handleUpdateTags = async (newTags: string[]) => {
    if (client) {
      await updateClient(client.id, { tags: newTags });
    }
  };

  const handleEditClient = async (data: Partial<Client>) => {
    if (client) {
      await updateClient(client.id, data);
      fetchClients();
    }
  };

  if (!client) {
    return null;
  }

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="pb-4 border-b">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16">
              {client.avatar_url ? (
                <AvatarImage src={client.avatar_url} alt={client.first_name} />
              ) : null}
              <AvatarFallback className="text-lg">
                {client.first_name[0]}{client.last_name?.[0] || ''}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <SheetTitle className="text-2xl">
                  {client.first_name} {client.last_name}
                </SheetTitle>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => setIsEditDialogOpen(true)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex gap-2 mt-2 flex-wrap">
                {currentStage && (
                  <Badge style={{ backgroundColor: currentStage.color }}>
                    {currentStage.name}
                  </Badge>
                )}
                {client.source && (
                  <Badge variant="secondary">{client.source}</Badge>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        <Tabs defaultValue="overview" className="mt-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Geral</TabsTrigger>
            <TabsTrigger value="notes">Anotações</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>

          {/* Tab: Visão Geral */}
          <TabsContent value="overview" className="space-y-4">
            {/* Informações de Contato */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Contato
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {client.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{client.email}</span>
                  </div>
                )}
                {client.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{client.phone}</span>
                  </div>
                )}
                {client.secondary_phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{client.secondary_phone}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Informações Pessoais */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Dados Pessoais
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {client.document_number && (
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>CPF/CNPJ: {client.document_number}</span>
                  </div>
                )}
                {client.birth_date && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>Nascimento: {format(new Date(client.birth_date), 'dd/MM/yyyy')}</span>
                  </div>
                )}
                {client.gender && (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>Gênero: {client.gender}</span>
                  </div>
                )}
                {client.created_at && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>Cliente há {formatDistanceToNow(new Date(client.created_at), { locale: ptBR })}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Métricas */}
            {((client as any).total_appointments > 0 || (client as any).total_sales > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Métricas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {(client as any).next_appointment && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-blue-500" />
                      <span>
                        Próximo agendamento: {format(new Date((client as any).next_appointment), "dd/MM 'às' HH:mm")}
                      </span>
                    </div>
                  )}
                  {(client as any).total_appointments > 0 && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>{(client as any).total_appointments} agendamento(s)</span>
                    </div>
                  )}
                  {(client as any).total_sales > 0 && (
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-green-500" />
                      <span>
                        {(client as any).total_sales} venda(s) - R$ {(client as any).total_revenue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Tags */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <ClientTagManager 
                  tags={client.tags || []}
                  onChange={handleUpdateTags}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Anotações */}
          <TabsContent value="notes" className="space-y-4">
            <Card>
              <CardContent className="pt-6 space-y-2">
                <Textarea 
                  placeholder="Adicionar nova anotação..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  rows={3}
                />
                <Button 
                  onClick={handleAddNote} 
                  disabled={!newNote.trim()}
                  className="w-full"
                >
                  Salvar Anotação
                </Button>
              </CardContent>
            </Card>

            {notesLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : notes.length > 0 ? (
              notes.map((note) => (
                <Card key={note.id}>
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start gap-2">
                      <p className="text-sm flex-1">{note.note}</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteNote(note.id)}
                        className="h-8 w-8"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {format(new Date(note.created_at), "dd/MM/yyyy 'às' HH:mm")}
                      {note.creator && (
                        <span className="ml-2">
                          por {note.creator.full_name || note.creator.email}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  Nenhuma anotação ainda
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab: Histórico */}
          <TabsContent value="history" className="space-y-2">
            {historyLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : history.length > 0 ? (
              history.map((item) => (
                <div 
                  key={item.id} 
                  className="flex items-start gap-3 p-3 border-l-2 rounded-r-lg bg-card"
                  style={{ borderColor: item.stage.color }}
                >
                  <ArrowRight className="h-4 w-4 mt-1" style={{ color: item.stage.color }} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      Entrou em {item.stage.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(item.entered_at), "dd/MM/yyyy 'às' HH:mm")}
                    </p>
                    {item.left_at && (
                      <p className="text-xs text-muted-foreground">
                        Saiu em {format(new Date(item.left_at), "dd/MM/yyyy 'às' HH:mm")}
                        {item.duration_minutes && ` (${Math.floor(item.duration_minutes / 60)}h ${item.duration_minutes % 60}min)`}
                      </p>
                    )}
                    {item.mover && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Movido por {item.mover.full_name || item.mover.email}
                      </p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  Nenhum histórico disponível
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <ClientFormDialog
          isOpen={isEditDialogOpen}
          onClose={() => setIsEditDialogOpen(false)}
          client={client}
          stages={stages}
          onSave={handleEditClient}
        />
      </SheetContent>
    </Sheet>
  );
}

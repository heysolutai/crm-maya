import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { 
  StickyNote, Trash2, Plus, Bell, Clock, Calendar, 
  AlertCircle, CheckCircle2, X 
} from 'lucide-react';
import { useConversationNotes } from '@/hooks/useConversationNotes';
import { useReminders, Reminder } from '@/hooks/useReminders';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ConversationNotesProps {
  conversationId: string;
  clientId?: string;
  clientName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: 'Pendente', color: 'bg-yellow-500/20 text-yellow-600', icon: <Clock className="h-3 w-3" /> },
  sent: { label: 'Enviado', color: 'bg-green-500/20 text-green-600', icon: <CheckCircle2 className="h-3 w-3" /> },
  cancelled: { label: 'Cancelado', color: 'bg-muted text-muted-foreground', icon: <X className="h-3 w-3" /> },
  failed: { label: 'Falhou', color: 'bg-red-500/20 text-red-600', icon: <AlertCircle className="h-3 w-3" /> },
};

export function ConversationNotes({ conversationId, clientId, clientName, open, onOpenChange }: ConversationNotesProps) {
  const [newNote, setNewNote] = useState('');
  const { notes, createNote, deleteNote } = useConversationNotes(conversationId);
  
  // Reminders state
  const [showNewReminderForm, setShowNewReminderForm] = useState(false);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [messageText, setMessageText] = useState('');
  
  const { reminders, isLoading: isLoadingReminders, createReminder, cancelReminder, getPendingCount } = useReminders(conversationId);
  const pendingCount = getPendingCount(conversationId);

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    createNote({ note: newNote });
    setNewNote('');
  };

  const handleCreateReminder = async () => {
    if (!scheduledDate || !scheduledTime || !messageText.trim() || !clientId) return;

    const scheduledFor = new Date(`${scheduledDate}T${scheduledTime}`);
    
    if (scheduledFor <= new Date()) return;

    await createReminder.mutateAsync({
      conversationId,
      clientId,
      scheduledFor,
      messageText: messageText.trim(),
    });

    setScheduledDate('');
    setScheduledTime('');
    setMessageText('');
    setShowNewReminderForm(false);
  };

  const handleCancelReminder = async () => {
    if (!cancelConfirmId) return;
    await cancelReminder.mutateAsync(cancelConfirmId);
    setCancelConfirmId(null);
  };

  const now = new Date();
  const minDate = format(now, 'yyyy-MM-dd');
  const minTime = scheduledDate === minDate ? format(now, 'HH:mm') : '00:00';

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <StickyNote className="h-5 w-5" />
              Notas & Lembretes
              {clientName && <span className="text-muted-foreground font-normal text-sm">• {clientName}</span>}
            </SheetTitle>
          </SheetHeader>

          <Tabs defaultValue="notes" className="mt-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="notes" className="flex items-center gap-2">
                <StickyNote className="h-4 w-4" />
                Notas
                {notes.length > 0 && (
                  <Badge variant="secondary" className="h-5 w-5 p-0 flex items-center justify-center text-xs">
                    {notes.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="reminders" className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Lembretes
                {pendingCount > 0 && (
                  <Badge className="h-5 w-5 p-0 flex items-center justify-center text-xs bg-primary">
                    {pendingCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Tab de Notas */}
            <TabsContent value="notes" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Textarea
                  placeholder="Digite sua nota interna aqui... Somente agentes podem ver."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="min-h-[100px]"
                />
                <Button 
                  onClick={handleAddNote} 
                  disabled={!newNote.trim()}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Nota
                </Button>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  Histórico de Notas
                  <Badge variant="secondary">{notes.length}</Badge>
                </h3>
                
                <ScrollArea className="h-[calc(100vh-420px)]">
                  {notes.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      <StickyNote className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Nenhuma nota interna ainda</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {notes.map((note: any) => (
                        <div 
                          key={note.id}
                          className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-lg p-3"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={note.user?.avatar_url} />
                                <AvatarFallback className="text-xs">
                                  {note.user?.full_name?.charAt(0) || 'A'}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-xs font-medium">{note.user?.full_name || 'Agente'}</p>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(note.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                              onClick={() => deleteNote(note.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{note.note}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </TabsContent>

            {/* Tab de Lembretes */}
            <TabsContent value="reminders" className="space-y-4 mt-4">
              {isLoadingReminders ? (
                <div className="text-center py-4 text-muted-foreground">Carregando...</div>
              ) : reminders && reminders.length > 0 ? (
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2 pr-2">
                    {reminders.map((reminder) => (
                      <ReminderItem
                        key={reminder.id}
                        reminder={reminder}
                        onCancel={() => setCancelConfirmId(reminder.id)}
                      />
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <Bell className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhum lembrete agendado</p>
                </div>
              )}

              <Separator />

              {showNewReminderForm ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="date" className="text-xs">Data</Label>
                      <Input
                        id="date"
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        min={minDate}
                        className="h-9"
                      />
                    </div>
                    <div>
                      <Label htmlFor="time" className="text-xs">Hora</Label>
                      <Input
                        id="time"
                        type="time"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        min={minTime}
                        className="h-9"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="reminder-message" className="text-xs">Mensagem</Label>
                    <Textarea
                      id="reminder-message"
                      placeholder="Digite a mensagem do lembrete..."
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      rows={3}
                      className="resize-none"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowNewReminderForm(false);
                        setScheduledDate('');
                        setScheduledTime('');
                        setMessageText('');
                      }}
                      className="flex-1"
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleCreateReminder}
                      disabled={!scheduledDate || !scheduledTime || !messageText.trim() || !clientId || createReminder.isPending}
                      className="flex-1"
                    >
                      {createReminder.isPending ? 'Salvando...' : 'Agendar'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowNewReminderForm(true)}
                  disabled={!clientId}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Lembrete
                </Button>
              )}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* Confirmation dialog for cancel reminder */}
      <AlertDialog open={!!cancelConfirmId} onOpenChange={() => setCancelConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar lembrete?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O lembrete não será enviado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelReminder}>
              Cancelar Lembrete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ReminderItem({ 
  reminder, 
  onCancel 
}: { 
  reminder: Reminder; 
  onCancel: () => void;
}) {
  const status = statusConfig[reminder.status] || statusConfig.pending;
  const scheduledDate = new Date(reminder.scheduled_for);

  return (
    <div className="p-3 rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="secondary" className={`${status.color} text-xs gap-1`}>
              {status.icon}
              {status.label}
            </Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(scheduledDate, "dd/MM 'às' HH:mm", { locale: ptBR })}
            </span>
          </div>
          <p className="text-sm truncate">{reminder.message_text}</p>
          {reminder.error_message && (
            <p className="text-xs text-red-500 mt-1">{reminder.error_message}</p>
          )}
        </div>

        {reminder.status === 'pending' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={onCancel}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

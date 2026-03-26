import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bell, Calendar, Clock, Plus, Trash2, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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
import { useReminders, Reminder } from '@/hooks/useReminders';

interface ReminderManagerProps {
  conversationId: string;
  clientId: string;
  clientName?: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: 'Pendente', color: 'bg-yellow-500/20 text-yellow-600', icon: <Clock className="h-3 w-3" /> },
  sent: { label: 'Enviado', color: 'bg-green-500/20 text-green-600', icon: <CheckCircle2 className="h-3 w-3" /> },
  cancelled: { label: 'Cancelado', color: 'bg-muted text-muted-foreground', icon: <X className="h-3 w-3" /> },
  failed: { label: 'Falhou', color: 'bg-red-500/20 text-red-600', icon: <AlertCircle className="h-3 w-3" /> },
};

export function ReminderManager({ conversationId, clientId, clientName }: ReminderManagerProps) {
  const [open, setOpen] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  
  // Form state
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [messageText, setMessageText] = useState('');

  const { reminders, isLoading, createReminder, cancelReminder, getPendingCount } = useReminders(conversationId);

  const pendingCount = getPendingCount(conversationId);

  const handleCreate = async () => {
    if (!scheduledDate || !scheduledTime || !messageText.trim()) return;

    const scheduledFor = new Date(`${scheduledDate}T${scheduledTime}`);
    
    if (scheduledFor <= new Date()) {
      return;
    }

    await createReminder.mutateAsync({
      conversationId,
      clientId,
      scheduledFor,
      messageText: messageText.trim(),
    });

    // Reset form
    setScheduledDate('');
    setScheduledTime('');
    setMessageText('');
    setShowNewForm(false);
  };

  const handleCancel = async () => {
    if (!cancelConfirmId) return;
    await cancelReminder.mutateAsync(cancelConfirmId);
    setCancelConfirmId(null);
  };

  // Get minimum date/time (now)
  const now = new Date();
  const minDate = format(now, 'yyyy-MM-dd');
  const minTime = scheduledDate === minDate ? format(now, 'HH:mm') : '00:00';

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-4 w-4" />
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 bg-primary text-primary-foreground text-[10px] rounded-full flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Lembretes
              {clientName && <span className="text-muted-foreground font-normal">• {clientName}</span>}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Lista de lembretes existentes */}
            {isLoading ? (
              <div className="text-center py-4 text-muted-foreground">Carregando...</div>
            ) : reminders && reminders.length > 0 ? (
              <ScrollArea className="h-[200px]">
                <div className="space-y-2 pr-4">
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
              <div className="text-center py-4 text-muted-foreground">
                Nenhum lembrete agendado
              </div>
            )}

            <Separator />

            {/* Formulário de novo lembrete */}
            {showNewForm ? (
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
                  <Label htmlFor="message" className="text-xs">Mensagem</Label>
                  <Textarea
                    id="message"
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
                      setShowNewForm(false);
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
                    onClick={handleCreate}
                    disabled={!scheduledDate || !scheduledTime || !messageText.trim() || createReminder.isPending}
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
                onClick={() => setShowNewForm(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Novo Lembrete
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog for cancel */}
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
            <AlertDialogAction onClick={handleCancel}>
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
  const isPast = scheduledDate < new Date();

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

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useImpersonation } from '@/hooks/useImpersonation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  MessageSquare,
  XCircle,
  HelpCircle,
  Plus,
  ImagePlus,
  X,
  Loader2,
  BookOpen,
  TicketPlus,
  History,
} from 'lucide-react';
import { useSupportTickets } from '@/hooks/useSupportTickets';
import { useRef } from 'react';
import { useToast } from '@/hooks/use-toast';

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  open: { label: 'Aberto', icon: AlertTriangle, className: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
  in_progress: { label: 'Em Andamento', icon: Clock, className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  resolved: { label: 'Resolvido', icon: CheckCircle2, className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  closed: { label: 'Fechado', icon: XCircle, className: 'bg-muted text-muted-foreground border-border' },
};

const priorityConfig: Record<string, { label: string; className: string }> = {
  low: { label: 'Baixa', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  medium: { label: 'Média', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  high: { label: 'Alta', className: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  critical: { label: 'Crítica', className: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
};

const PRIORITIES = [
  { value: 'low', label: 'Baixa', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  { value: 'medium', label: 'Média', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  { value: 'high', label: 'Alta', color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  { value: 'critical', label: 'Crítica', color: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
];

const FAQ_ITEMS = [
  {
    question: 'Como enviar uma mensagem pelo WhatsApp?',
    answer: 'Acesse a página de Conversas no menu lateral, selecione um contato existente ou inicie uma nova conversa clicando no botão "+". Digite sua mensagem e pressione Enter ou clique no botão de enviar.',
  },
  {
    question: 'Como configurar a IA para responder automaticamente?',
    answer: 'Acesse Configurações > IA no menu lateral. Lá você pode configurar os prompts, comportamentos, horários de atendimento e o modelo de IA que será usado para responder automaticamente.',
  },
  {
    question: 'Como adicionar um novo membro à equipe?',
    answer: 'Acesse a página "Equipe" no menu lateral (disponível para administradores). Clique em "Adicionar Membro" e preencha os dados do novo usuário. Ele receberá um email com as credenciais de acesso.',
  },
  {
    question: 'Como funciona o CRM de funil?',
    answer: 'O CRM organiza seus clientes em etapas do funil de vendas. Você pode arrastar os cards entre as colunas para mover clientes entre etapas. As etapas podem ser personalizadas nas Configurações.',
  },
  {
    question: 'Como agendar uma consulta/reunião?',
    answer: 'Acesse a página "Agenda" no menu lateral. Clique em "Novo Agendamento", selecione o cliente, data, horário e preencha os detalhes. Se o Google Calendar estiver conectado, o evento será sincronizado automaticamente.',
  },
  {
    question: 'O que fazer se o WhatsApp desconectar?',
    answer: 'Verifique o indicador de status do WhatsApp no topo da tela. Se estiver vermelho, entre em contato com o suporte. Geralmente é necessário re-escanear o QR Code para reconectar.',
  },
  {
    question: 'Como exportar relatórios?',
    answer: 'Acesse a página "Relatório" no menu lateral. Lá você pode visualizar métricas diárias e enviar relatórios. Os dados são atualizados em tempo real com base nas conversas e agendamentos.',
  },
  {
    question: 'Como pausar a IA para um cliente específico?',
    answer: 'Na página de Conversas, selecione a conversa do cliente e clique no cabeçalho para abrir os detalhes. Lá você encontra a opção "Pausar IA" que desativa as respostas automáticas apenas para aquele cliente.',
  },
];

export default function SupportHistory() {
  const { companyId } = useAuth();
  const { isImpersonating, impersonatedCompanyId } = useImpersonation();
  const effectiveCompanyId = isImpersonating ? impersonatedCompanyId : companyId;

  // Ticket creation state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { submitTicket, isSubmitting } = useSupportTickets();

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['support-tickets', effectiveCompanyId],
    queryFn: async () => {
      if (!effectiveCompanyId) return [];
      const res = await fetch(`/api/support-tickets?companyId=${effectiveCompanyId}`);
      if (!res.ok) throw new Error('Failed to fetch tickets');
      return await res.json();
    },
    enabled: !!effectiveCompanyId,
  });

  const handleAddImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (images.length + imageFiles.length > 5) return;
    setImages(prev => [...prev, ...imageFiles]);
    imageFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => setPreviews(prev => [...prev, ev.target?.result as string]);
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setSubject('');
    setDescription('');
    setPriority('medium');
    setImages([]);
    setPreviews([]);
  };

  const handleSubmit = async () => {
    if (!subject.trim() || !description.trim() || images.length === 0) return;
    try {
      await submitTicket({ subject, description, images, priority });
      resetForm();
      setCreateDialogOpen(false);
    } catch {
      // toast handled in hook
    }
  };

  const activeTickets = tickets?.filter((t: any) => t.status === 'open' || t.status === 'in_progress') || [];
  const resolvedTickets = tickets?.filter((t: any) => t.status === 'resolved' || t.status === 'closed') || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Suporte</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tire dúvidas, crie e acompanhe tickets de suporte.
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} className="gap-2 rounded-xl">
          <Plus className="h-4 w-4" />
          Informar erro
        </Button>
      </div>

      <Tabs defaultValue="faq" className="w-full">
        <TabsList className="w-full justify-start rounded-xl bg-muted/50 p-1">
          <TabsTrigger value="faq" className="gap-2 rounded-lg">
            <BookOpen className="h-4 w-4" />
            FAQ
          </TabsTrigger>
          <TabsTrigger value="tickets" className="gap-2 rounded-lg">
            <TicketPlus className="h-4 w-4" />
            Soluções em andamento
            {activeTickets.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 min-w-[20px] px-1.5 rounded-full text-xs">
                {activeTickets.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2 rounded-lg">
            <History className="h-4 w-4" />
            Histórico
          </TabsTrigger>
        </TabsList>

        {/* FAQ Tab */}
        <TabsContent value="faq" className="mt-4">
          <Card className="p-6 rounded-xl">
            <div className="flex items-center gap-2 mb-4">
              <HelpCircle className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Perguntas Frequentes</h2>
            </div>
            <Accordion type="single" collapsible className="w-full">
              {FAQ_ITEMS.map((item: typeof FAQ_ITEMS[0], index: number) => (
                <AccordionItem key={index} value={`faq-${index}`}>
                  <AccordionTrigger className="text-sm text-left hover:no-underline">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Card>
        </TabsContent>

        {/* Active Tickets Tab */}
        <TabsContent value="tickets" className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : activeTickets.length === 0 ? (
            <Card className="flex flex-col items-center justify-center py-16 text-center rounded-xl">
              <CheckCircle2 className="h-12 w-12 text-emerald-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Sem erros pendentes</h3>
              <p className="text-sm text-muted-foreground">
                Nenhum erro em andamento no momento.
              </p>
            </Card>
          ) : (
             <div className="space-y-3">
              {activeTickets.map((t: any) => (
                <TicketCard key={t.id} ticket={t} effectiveCompanyId={effectiveCompanyId} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : resolvedTickets.length === 0 ? (
            <Card className="flex flex-col items-center justify-center py-16 text-center rounded-xl">
              <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Sem histórico</h3>
              <p className="text-sm text-muted-foreground">
                Tickets resolvidos aparecerão aqui.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {resolvedTickets.map((t: any) => (
                <TicketCard key={t.id} ticket={t} effectiveCompanyId={effectiveCompanyId} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Ticket Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={(v) => { if (!v) resetForm(); setCreateDialogOpen(v); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Informar erro
            </DialogTitle>
            <DialogDescription>
              Descreva o erro encontrado. É obrigatório anexar pelo menos uma captura de tela.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ticket-subject">Assunto</Label>
              <Input
                id="ticket-subject"
                placeholder="Resumo do problema..."
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ticket-description">Descrição</Label>
              <Textarea
                id="ticket-description"
                placeholder="Descreva o problema em detalhes..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>Prioridade</Label>
              <div className="flex flex-wrap gap-2">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-all ${p.color} ${
                      priority === p.value ? 'ring-2 ring-offset-2 ring-offset-background ring-primary scale-105' : 'opacity-60 hover:opacity-100'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Capturas de tela <span className="text-destructive">*</span> (mín. 1, máx. 5)</Label>
              <div className="flex flex-wrap gap-2">
                {previews.map((src, i) => (
                  <div key={i} className="relative h-20 w-20 rounded-md border border-border overflow-hidden group">
                    <img src={src} alt={`Screenshot ${i + 1}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute top-0.5 right-0.5 rounded-full bg-destructive p-0.5 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {images.length < 5 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-20 w-20 items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    <ImagePlus className="h-6 w-6" />
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleAddImages}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setCreateDialogOpen(false); }} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !subject.trim() || !description.trim() || images.length === 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                'Informar erro'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TicketCard({ ticket, effectiveCompanyId }: { ticket: any; effectiveCompanyId: string | null }) {
  const status = statusConfig[ticket.status] || statusConfig.open;
  const prio = priorityConfig[ticket.priority] || priorityConfig.medium;
  const StatusIcon = status.icon;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [updating, setUpdating] = useState(false);

  const handleStatusChange = async (newStatus: string) => {
    setUpdating(true);
    try {
      const res = await fetch('/api/support-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateStatus',
          ticketId: ticket.id,
          status: newStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro');
      queryClient.invalidateQueries({ queryKey: ['support-tickets', effectiveCompanyId] });
      toast({ title: 'Status atualizado' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Card className="p-4 hover:bg-muted/20 transition-colors rounded-xl">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 rounded-full p-1.5 ${status.className}`}>
          <StatusIcon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-sm">{ticket.subject}</h3>
            <Badge variant="outline" className={`text-[10px] rounded-full px-2 py-0 border ${prio.className}`}>
              {prio.label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{ticket.description}</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span>Criado em {format(new Date(ticket.created_at), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}</span>
            {ticket.resolved_at && (
              <span className="text-emerald-400">
                Resolvido em {format(new Date(ticket.resolved_at), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
            )}
          </div>
          {ticket.admin_notes && (
            <div className="mt-2 rounded-lg bg-muted/50 p-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground mb-1">Resposta do suporte:</p>
              <p>{ticket.admin_notes}</p>
            </div>
          )}
          <div className="mt-3">
            <Select value={ticket.status} onValueChange={handleStatusChange} disabled={updating}>
              <SelectTrigger className="w-[180px] h-8 text-xs rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Aberto</SelectItem>
                <SelectItem value="in_progress">Em Andamento</SelectItem>
                <SelectItem value="resolved">Resolvido</SelectItem>
                <SelectItem value="closed">Fechado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </Card>
  );
}

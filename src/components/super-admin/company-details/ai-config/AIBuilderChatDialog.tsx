import { apiFetch } from '@/lib/api/client';
import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Send, Loader2, Check, User, Clock, RotateCcw } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

const WEBHOOK_URL = 'https://webhook.mileto.heysolut.com.br/webhook/create-agent';

interface BusinessHourDay {
  enabled: boolean;
  start: string;
  end: string;
  notes?: string;
}

interface BusinessHoursSettings {
  monday: BusinessHourDay;
  tuesday: BusinessHourDay;
  wednesday: BusinessHourDay;
  thursday: BusinessHourDay;
  friday: BusinessHourDay;
  saturday: BusinessHourDay;
  sunday: BusinessHourDay;
}

const DEFAULT_BUSINESS_HOURS: BusinessHoursSettings = {
  monday: { enabled: true, start: '09:00', end: '18:00' },
  tuesday: { enabled: true, start: '09:00', end: '18:00' },
  wednesday: { enabled: true, start: '09:00', end: '18:00' },
  thursday: { enabled: true, start: '09:00', end: '18:00' },
  friday: { enabled: true, start: '09:00', end: '18:00' },
  saturday: { enabled: false, start: '09:00', end: '13:00' },
  sunday: { enabled: false, start: '09:00', end: '13:00' },
};

const DAY_LABELS: Record<keyof BusinessHoursSettings, string> = {
  monday: 'Segunda', tuesday: 'Terça', wednesday: 'Quarta',
  thursday: 'Quinta', friday: 'Sexta', saturday: 'Sábado', sunday: 'Domingo',
};

interface ChatMessage {
  id: string;
  role: 'bot' | 'user';
  content: string;
  type?: 'text' | 'hours' | 'summary';
}

const QUESTIONS = [
  { key: 'company_name', question: 'Olá! 👋 Vou te ajudar a criar seu agente de IA. Para começar, qual é o **nome da empresa**?', required: true },
  { key: 'agent_name', question: 'Ótimo! E qual será o **nome do agente** (ex: Ana, Pedro, Mia)?', required: true },
  { key: 'segment', question: 'Qual é o **segmento** da empresa? (ex: Ótica, Clínica, Loja de roupas)', required: false },
  { key: 'endereco', question: 'Qual é o **endereço** da empresa? (ex: Rua das Flores, 123 - Centro, São Paulo)', required: false },
  { key: 'papel', question: 'Agora vamos definir a **persona** do agente. Como ele deve se comportar? Descreva a personalidade, tom de voz e como ele se apresenta.\n\n_Exemplo: "Você é a Ana, assistente simpática e objetiva. Use linguagem casual mas profissional."_', required: true },
  { key: 'objetivo', question: 'Qual é o **objetivo principal** do agente? O que ele deve buscar em cada conversa?\n\n_Exemplo: "Converter leads em vendas, entender a necessidade antes de oferecer produtos."_', required: true },
  { key: 'funcao', question: 'Quais **funções** o agente pode executar? Liste as ações que ele pode realizar.\n\n_Exemplo: "Responder dúvidas, agendar consultas, enviar catálogo, transferir para humano."_', required: false },
  { key: 'funil', question: 'Descreva o **funil de atendimento** — as etapas que o agente segue do início ao fechamento.\n\n_Exemplo:\nEtapa 1: Boas-vindas\nEtapa 2: Qualificação\nEtapa 3: Apresentação\nEtapa 4: Fechamento_', required: true },
  { key: 'regras', question: 'Quais são as **regras de negócio** que o agente deve seguir? Limites, restrições, políticas.\n\n_Exemplo: "Nunca inventar informações. Desconto máximo: 10%. Pagamento: PIX, cartão até 10x."_', required: true },
  { key: 'hours', question: 'Agora vamos configurar os **horários de funcionamento**. Ajuste os horários abaixo:', required: false, type: 'hours' as const },
  { key: 'boas_vindas', question: 'Por último, qual será a **mensagem de boas-vindas** que o agente envia para novos clientes?\n\n_Exemplo: "Olá! 👋 Sou a Ana, assistente virtual da Ótica Premium! Como posso te ajudar?"_', required: true },
];

interface AIBuilderChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
}

export function AIBuilderChatDialog({ open, onOpenChange, companyId }: AIBuilderChatDialogProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [businessHours, setBusinessHours] = useState<BusinessHoursSettings>(DEFAULT_BUSINESS_HOURS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: apiKey } = useQuery({
    queryKey: ['company-api-key', companyId],
    queryFn: async () => {
      const res = await apiFetch(`/api/api-keys?companyId=${companyId}`);
      if (!res.ok) return null;
      const keys = await res.json();
      const activeKey = Array.isArray(keys) ? keys.find((k: any) => k.isActive) : null;
      return activeKey?.key || null;
    },
    enabled: !!companyId,
  });

  const { data: companyData } = useQuery({
    queryKey: ['company-builder-data', companyId],
    queryFn: async () => {
      const res = await apiFetch(`/api/companies?id=${companyId}`);
      if (!res.ok) return null;
      return await res.json();
    },
    enabled: !!companyId,
  });

  // Initialize chat when dialog opens
  useEffect(() => {
    if (open && messages.length === 0) {
      // Pre-populate from company data
      const preAnswers: Record<string, string> = {};
      if (companyData) {
        preAnswers.company_name = companyData.tradeName || companyData.trade_name || companyData.name || '';
        if (companyData.address) {
          const addr = companyData.address as Record<string, string>;
          const parts = [addr.street, addr.number, addr.neighborhood, addr.city, addr.state].filter(Boolean);
          preAnswers.endereco = parts.length > 0 ? parts.join(', ') : '';
        }
        const settings = companyData.settings as Record<string, unknown> | null;
        if (settings?.business_hours) {
          setBusinessHours(settings.business_hours as BusinessHoursSettings);
        }
      }
      setAnswers(preAnswers);

      // Start first question with typing animation
      setTimeout(() => {
        addBotMessage(QUESTIONS[0].question);
      }, 500);
    }
  }, [open, companyData]);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setMessages([]);
      setCurrentQuestionIndex(0);
      setInputValue('');
      setAnswers({});
      setBusinessHours(DEFAULT_BUSINESS_HOURS);
      setIsComplete(false);
      setIsTyping(false);
    }
  }, [open]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        setTimeout(() => {
          viewport.scrollTop = viewport.scrollHeight;
        }, 100);
      }
    }
  }, [messages, isTyping]);

  const addBotMessage = (content: string, type?: 'text' | 'hours' | 'summary') => {
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'bot',
        content,
        type: type || 'text',
      }]);
    }, 800);
  };

  const handleSend = () => {
    const q = QUESTIONS[currentQuestionIndex];
    const value = inputValue.trim();

    if (q.required && !value) {
      toast.error('Este campo é obrigatório.');
      return;
    }

    // Add user message
    if (value) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: value }]);
    }

    // Store answer
    setAnswers(prev => ({ ...prev, [q.key]: value }));
    setInputValue('');

    // Move to next question
    const nextIndex = currentQuestionIndex + 1;
    if (nextIndex < QUESTIONS.length) {
      setCurrentQuestionIndex(nextIndex);
      const nextQ = QUESTIONS[nextIndex];
      addBotMessage(nextQ.question, nextQ.type);
    } else {
      // All questions done — show summary
      setIsComplete(true);
      addBotMessage('✅ Perfeito! Aqui está o resumo do seu agente. Revise e clique em **Enviar** para gerar!', 'summary');
    }
  };

  const handleHoursConfirm = () => {
    // Add user confirmation message
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: '✅ Horários configurados' }]);
    setAnswers(prev => ({ ...prev, hours: 'configured' }));

    const nextIndex = currentQuestionIndex + 1;
    if (nextIndex < QUESTIONS.length) {
      setCurrentQuestionIndex(nextIndex);
      const nextQ = QUESTIONS[nextIndex];
      addBotMessage(nextQ.question, nextQ.type);
    } else {
      setIsComplete(true);
      addBotMessage('✅ Perfeito! Aqui está o resumo do seu agente. Revise e clique em **Enviar** para gerar!', 'summary');
    }
  };

  const handleSkip = () => {
    const q = QUESTIONS[currentQuestionIndex];
    if (q.required) return;

    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: '⏭️ Pulado' }]);
    setAnswers(prev => ({ ...prev, [q.key]: '' }));

    const nextIndex = currentQuestionIndex + 1;
    if (nextIndex < QUESTIONS.length) {
      setCurrentQuestionIndex(nextIndex);
      const nextQ = QUESTIONS[nextIndex];
      addBotMessage(nextQ.question, nextQ.type);
    } else {
      setIsComplete(true);
      addBotMessage('✅ Perfeito! Aqui está o resumo do seu agente. Revise e clique em **Enviar** para gerar!', 'summary');
    }
  };

  const handleSubmit = async () => {
    if (!apiKey) {
      toast.error('Nenhuma API key ativa encontrada para esta empresa.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        company_id: companyId,
        api_key: apiKey,
        company_name: answers.company_name,
        agent_name: answers.agent_name,
        segment: answers.segment || '',
        endereco: answers.endereco || '',
        papel: answers.papel || '',
        objetivo: answers.objetivo || '',
        funcao: answers.funcao || '',
        funil: answers.funil || '',
        regras: answers.regras || '',
        boas_vindas: answers.boas_vindas || '',
        horarios_funcionamento: businessHours,
      };

      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`Erro: ${response.status}`);
      toast.success('Agente enviado para geração com sucesso! 🚀');
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao enviar para geração');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestart = () => {
    setMessages([]);
    setCurrentQuestionIndex(0);
    setInputValue('');
    setAnswers({});
    setIsComplete(false);
    setIsTyping(false);
    setTimeout(() => addBotMessage(QUESTIONS[0].question), 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const currentQ = QUESTIONS[currentQuestionIndex];
  const isHoursStep = currentQ?.type === 'hours' && !isComplete;

  const handleDayChange = (day: keyof BusinessHoursSettings, field: keyof BusinessHourDay, value: boolean | string) => {
    setBusinessHours(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  };

  const renderSummary = () => (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm mt-2">
      {[
        { label: 'Empresa', value: answers.company_name },
        { label: 'Agente', value: answers.agent_name },
        { label: 'Segmento', value: answers.segment },
        { label: 'Endereço', value: answers.endereco },
        { label: 'Persona', value: answers.papel },
        { label: 'Objetivo', value: answers.objetivo },
        { label: 'Função', value: answers.funcao },
        { label: 'Funil', value: answers.funil },
        { label: 'Regras', value: answers.regras },
        { label: 'Boas-vindas', value: answers.boas_vindas },
      ].filter(r => r.value?.trim()).map(r => (
        <div key={r.label} className="flex gap-2">
          <span className="font-medium text-muted-foreground min-w-[80px] shrink-0">{r.label}:</span>
          <span className="line-clamp-2 whitespace-pre-line">{r.value}</span>
        </div>
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Criar Agente IA</DialogTitle>
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b bg-primary/5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Bot className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sm">Assistente de Criação de Agente</h3>
            <p className="text-xs text-muted-foreground">
              {isComplete
                ? 'Resumo pronto — revise e envie!'
                : `Pergunta ${currentQuestionIndex + 1} de ${QUESTIONS.length}`}
            </p>
          </div>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleRestart} className="gap-1 text-xs">
              <RotateCcw className="h-3.5 w-3.5" /> Recomeçar
            </Button>
          )}
        </div>

        {/* Chat area */}
        <ScrollArea className="flex-1 px-4" ref={scrollRef}>
          <div className="space-y-4 py-4">
            {messages.map(msg => (
              <div key={msg.id} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                {msg.role === 'bot' && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary mt-0.5">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                )}
                <div className={cn(
                  'rounded-2xl px-4 py-2.5 max-w-[80%] text-sm whitespace-pre-line',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-md'
                    : 'bg-muted rounded-bl-md',
                )}>
                  {msg.content}
                  {msg.type === 'summary' && isComplete && renderSummary()}
                </div>
                {msg.role === 'user' && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted mt-0.5">
                    <User className="h-3.5 w-3.5" />
                  </div>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {isTyping && (
              <div className="flex gap-2 items-start">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Bot className="h-3.5 w-3.5" />
                </div>
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            {/* Hours inline editor */}
            {isHoursStep && !isTyping && messages.length > 0 && messages[messages.length - 1]?.type === 'hours' && (
              <div className="ml-9 rounded-lg border p-3 space-y-2 bg-background">
                {(Object.keys(DAY_LABELS) as Array<keyof BusinessHoursSettings>).map(day => (
                  <div key={day} className="flex items-center gap-2 flex-wrap">
                    <Switch
                      checked={businessHours[day].enabled}
                      onCheckedChange={(c) => handleDayChange(day, 'enabled', c)}
                    />
                    <Label className="text-xs font-medium w-16">{DAY_LABELS[day]}</Label>
                    <Input
                      type="time"
                      value={businessHours[day].start}
                      onChange={(e) => handleDayChange(day, 'start', e.target.value)}
                      disabled={!businessHours[day].enabled}
                      className="w-24 h-8 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">-</span>
                    <Input
                      type="time"
                      value={businessHours[day].end}
                      onChange={(e) => handleDayChange(day, 'end', e.target.value)}
                      disabled={!businessHours[day].enabled}
                      className="w-24 h-8 text-xs"
                    />
                    <Input
                      placeholder="Obs..."
                      value={businessHours[day].notes || ''}
                      onChange={(e) => handleDayChange(day, 'notes', e.target.value)}
                      disabled={!businessHours[day].enabled}
                      className="flex-1 min-w-[100px] h-8 text-xs"
                    />
                  </div>
                ))}
                <Button size="sm" onClick={handleHoursConfirm} className="gap-1 mt-2">
                  <Check className="h-3.5 w-3.5" /> Confirmar Horários
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input area */}
        <div className="border-t p-3 bg-background">
          {isComplete ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleRestart} className="gap-1">
                <RotateCcw className="h-4 w-4" /> Refazer
              </Button>
              <Button className="flex-1 gap-2" onClick={handleSubmit} disabled={isSubmitting || !apiKey}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {isSubmitting ? 'Enviando...' : 'Enviar para Geração'}
              </Button>
            </div>
          ) : isHoursStep ? (
            <p className="text-xs text-muted-foreground text-center py-1">
              Configure os horários acima e clique em "Confirmar Horários"
            </p>
          ) : (
            <div className="flex gap-2 items-end">
              <Textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={currentQ?.required ? 'Digite sua resposta...' : 'Digite ou pule (opcional)...'}
                className="min-h-[40px] max-h-[120px] resize-none text-sm"
                rows={1}
                disabled={isTyping}
              />
              {!currentQ?.required && (
                <Button variant="ghost" size="sm" onClick={handleSkip} disabled={isTyping} className="text-xs shrink-0">
                  Pular
                </Button>
              )}
              <Button size="icon" onClick={handleSend} disabled={isTyping || (currentQ?.required && !inputValue.trim())} className="shrink-0">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}
          {!apiKey && (
            <p className="text-xs text-destructive mt-2 text-center">
              ⚠️ Nenhuma API key ativa — crie uma na aba "API Keys" antes de enviar.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

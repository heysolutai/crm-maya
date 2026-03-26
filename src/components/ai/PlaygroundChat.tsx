import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, RotateCcw, Bot, User, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useApiKeys } from '@/hooks/useApiKeys';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

const WEBHOOK_URL = 'https://webhook.mileto.heysolut.com.br/webhook/playground';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
}

interface PlaygroundChatProps {
  companyId: string;
}

export function PlaygroundChat({ companyId }: PlaygroundChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { apiKeys, isLoading: loadingKeys } = useApiKeys(companyId);

  const activeApiKey = useMemo(
    () => apiKeys?.find((k) => k.is_active)?.key ?? null,
    [apiKeys]
  );

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleNewSession = () => {
    setMessages([]);
    setSessionId(crypto.randomUUID());
    setInput('');
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: text,
          company_id: companyId,
          api_key: activeApiKey,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      const aiMsg: Message = {
        id: crypto.randomUUID(),
        role: 'ai',
        content: data.response ?? 'Sem resposta do agente.',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: 'ai',
        content: `⚠️ Erro ao conectar com o agente: ${err.message}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loadingKeys) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card className="flex flex-col h-[600px] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">Playground IA</span>
          <span className="text-xs text-muted-foreground font-mono">
            sessão: {sessionId.slice(0, 8)}…
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleNewSession} className="gap-1.5">
          <RotateCcw className="h-4 w-4" />
          Nova sessão
        </Button>
      </div>

      {/* Warning if no API key */}
      {!activeApiKey && (
        <div className="flex items-center gap-2 bg-destructive/10 text-destructive px-4 py-2 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Nenhuma API Key ativa encontrada. Crie uma na aba "API Keys" para o playground funcionar corretamente.
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-4" ref={scrollRef as any}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-16">
            <Bot className="h-12 w-12 opacity-30" />
            <p className="text-sm">Envie uma mensagem para testar o agente de IA</p>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex gap-3 max-w-[85%]',
                msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
              )}
            >
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div
                className={cn(
                  'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-md'
                    : 'bg-muted text-foreground rounded-bl-md'
                )}
              >
                {msg.role === 'ai' ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:m-0">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                )}
                <div
                  className={cn(
                    'text-[10px] mt-1 opacity-60',
                    msg.role === 'user' ? 'text-right' : 'text-left'
                  )}
                >
                  {msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 mr-auto max-w-[85%]">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3">
                <div className="flex gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-foreground/30 animate-bounce [animation-delay:0ms]" />
                  <span className="h-2 w-2 rounded-full bg-foreground/30 animate-bounce [animation-delay:150ms]" />
                  <span className="h-2 w-2 rounded-full bg-foreground/30 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t p-3">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite uma mensagem para testar o agente…"
            className="min-h-[44px] max-h-[120px] resize-none text-sm"
            rows={1}
            disabled={isLoading}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="shrink-0 h-[44px] w-[44px]"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Send,
  RotateCcw,
  Bot,
  User,
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Pencil,
  Wrench,
  XCircle,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { useAIConfigurations } from '@/hooks/useAIConfigurations';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api/client';
import { cn } from '@/lib/utils';

/**
 * "Testar a IA": conversa de teste com a IA (Maestro), sem número de WhatsApp.
 * Mesmo prompt, modelo e ferramentas do atendimento. As ferramentas do
 * restaurante rodam de verdade (com o "cliente do teste"); só o que depende de
 * uma conversa real é simulado. Cada ferramenta chamada aparece como um passo
 * na conversa (clique para ver nome, argumentos e saída).
 * Ver src/lib/maestro/playground.ts.
 */

const explicacaoSchema = z.object({
  nivel: z.enum(['problema', 'aviso', 'normal']),
  motivo: z.string(),
  oQueFazer: z.string().nullable(),
});

const toolRunSchema = z.object({
  name: z.string(),
  label: z.string().optional(),
  args: z.unknown(),
  ok: z.boolean(),
  result: z.unknown(),
  simulated: z.boolean(),
  ms: z.number().optional(),
  explicacao: explicacaoSchema.nullable().optional(),
  erro: z.string().nullable().optional(),
});

/** Resposta de POST /api/maestro/playground. */
const maestroReplySchema = z.object({
  reply: z.string(),
  /** Resposta em balões, como sai no WhatsApp. */
  partes: z.array(z.string()).optional(),
  tools: z.array(toolRunSchema).default([]),
  model: z.string().optional(),
  ms: z.number().optional(),
});

/** Resposta de GET /api/maestro/playground (dá pra testar?). */
interface Prontidao {
  pronto: boolean;
  bloqueio: { titulo: string; oQueFazer: string } | null;
  avisos: string[];
  modelo: string;
  ferramentas: { nome: string; label: string; simulada: boolean; altera: boolean }[];
  motor: string;
  /** Prompt completo que a IA recebe: só vem para o super-admin. */
  prompt?: string;
}

/** Super-admin: o prompt inteiro que a IA recebe (do restaurante + regras + roteiro + calendário). */
function PromptCompleto({ prompt }: { prompt: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1500);
    } catch {
      // clipboard bloqueado: ignora
    }
  };
  return (
    <details className="text-[11px]">
      <summary className="cursor-pointer text-primary hover:underline">
        (Suporte) Ver o prompt completo que a IA recebe
      </summary>
      <div className="mt-1 space-y-1">
        <button type="button" onClick={copiar} className="text-primary hover:underline max-sm:min-h-9">
          {copiado ? 'Copiado!' : 'Copiar'}
        </button>
        <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-md border bg-background p-2 font-mono text-[11px] text-foreground">
          {prompt}
        </pre>
      </div>
    </details>
  );
}

type ToolRun = z.infer<typeof toolRunSchema>;

type Message =
  | { id: string; role: 'user'; content: string; timestamp: Date }
  | { id: string; role: 'ai'; content: string; timestamp: Date; model?: string; ms?: number }
  | { id: string; role: 'tool'; tool: ToolRun; timestamp: Date };

interface ClienteTeste {
  nome: string;
  telefone: string;
}

interface PlaygroundChatProps {
  companyId: string;
  agentId?: string;
  /** WhatsApp testado: as ferramentas usam o ID do restaurante dele. */
  inboxId?: string;
}

const ERRO_PADRAO = 'Não foi possível testar agora. Tente de novo em instantes.';
const CHAVE_CLIENTE = 'maya:testar-ia:cliente';
const CLIENTE_PADRAO: ClienteTeste = { nome: 'Cliente Teste', telefone: '' };

function lerCliente(): ClienteTeste {
  try {
    const bruto = window.localStorage.getItem(CHAVE_CLIENTE);
    if (!bruto) return CLIENTE_PADRAO;
    const v: unknown = JSON.parse(bruto);
    if (!v || typeof v !== 'object') return CLIENTE_PADRAO;
    const o = v as Record<string, unknown>;
    return {
      nome: typeof o.nome === 'string' && o.nome.trim() ? o.nome : CLIENTE_PADRAO.nome,
      telefone: typeof o.telefone === 'string' ? o.telefone : '',
    };
  } catch {
    return CLIENTE_PADRAO;
  }
}

function gravarCliente(c: ClienteTeste) {
  try {
    window.localStorage.setItem(CHAVE_CLIENTE, JSON.stringify(c));
  } catch {
    // sem armazenamento (aba anônima): vale só nesta tela
  }
}

/**
 * A conversa de teste fica neste navegador (por agente e WhatsApp): sair da
 * aba ou recarregar a página continua a mesma conversa; só "Nova conversa"
 * começa outra.
 */
const CHAVE_CONVERSA = 'maya:testar-ia:conversa';
/** Guarda as últimas: o bastante pra continuar o teste sem lotar o navegador. */
const MAX_GUARDADAS = 100;

const mensagemGuardadaSchema = z.discriminatedUnion('role', [
  z.object({ id: z.string(), role: z.literal('user'), content: z.string(), timestamp: z.coerce.date() }),
  z.object({
    id: z.string(),
    role: z.literal('ai'),
    content: z.string(),
    timestamp: z.coerce.date(),
    model: z.string().optional(),
    ms: z.number().optional(),
  }),
  z.object({ id: z.string(), role: z.literal('tool'), tool: toolRunSchema, timestamp: z.coerce.date() }),
]);

function lerConversa(chave: string): Message[] {
  try {
    const bruto = window.localStorage.getItem(chave);
    if (!bruto) return [];
    const lista: unknown = JSON.parse(bruto);
    if (!Array.isArray(lista)) return [];
    // Mensagem que nao confere (versao antiga da tela) fica de fora, o resto continua.
    return lista.flatMap((m): Message[] => {
      const r = mensagemGuardadaSchema.safeParse(m);
      return r.success ? [r.data] : [];
    });
  } catch {
    return [];
  }
}

function gravarConversa(chave: string, mensagens: Message[]) {
  try {
    if (mensagens.length === 0) window.localStorage.removeItem(chave);
    else window.localStorage.setItem(chave, JSON.stringify(mensagens.slice(-MAX_GUARDADAS)));
  } catch {
    // sem armazenamento (aba anônima) ou cheio: a conversa vale só nesta tela
  }
}

function telefoneValido(t: string): boolean {
  const d = t.replace(/\D/g, '');
  return !d || (d.length >= 10 && d.length <= 15);
}

/** Mensagem do servidor (já em português simples) ou a padrão. */
async function mensagemDoServidor(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json();
    const erro = data && typeof data === 'object' ? (data as { error?: unknown }).error : null;
    return typeof erro === 'string' && erro.trim() ? erro : ERRO_PADRAO;
  } catch {
    return ERRO_PADRAO;
  }
}

/** JSON legível (argumentos da ferramenta). */
function jsonBonito(valor: unknown): string {
  try {
    const texto = JSON.stringify(valor, null, 2) ?? '';
    return texto.length > 3000 ? `${texto.slice(0, 3000)}…` : texto;
  } catch {
    return '';
  }
}

function textoSaida(valor: unknown): string {
  if (typeof valor === 'string') return valor;
  return jsonBonito(valor);
}

function horaComSegundos(d: Date): string {
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Estado visual de um passo. */
function estadoDoPasso(t: ToolRun): { rotulo: string; icone: typeof Info; classe: string } {
  if (t.ok) {
    return t.simulated
      ? { rotulo: 'simulado', icone: Info, classe: 'text-muted-foreground' }
      : { rotulo: 'deu certo', icone: CheckCircle2, classe: 'text-emerald-600 dark:text-emerald-400' };
  }
  if (t.explicacao?.nivel === 'normal') return { rotulo: 'não feito', icone: Info, classe: 'text-muted-foreground' };
  return { rotulo: 'falhou', icone: XCircle, classe: 'text-destructive' };
}

/**
 * Um passo da IA na conversa: "Chamou: Fazer reservas · deu certo". Clicando,
 * abre o detalhe (nome, argumentos, saída), como no histórico de um fluxo.
 */
function PassoDaFerramenta({ tool, quando, superAdmin }: { tool: ToolRun; quando: Date; superAdmin: boolean }) {
  const estado = estadoDoPasso(tool);
  const Icone = estado.icone;
  const nome = tool.label || tool.name;

  return (
    <div className="flex justify-center">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:min-h-9"
          >
            <Wrench className="h-3 w-3 shrink-0" />
            <span className="truncate">
              Chamou: <span className="font-medium text-foreground">{nome}</span>
            </span>
            <Icone className={cn('h-3.5 w-3.5 shrink-0', estado.classe)} />
            <span className={cn('shrink-0', estado.classe)}>{estado.rotulo}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(92vw,26rem)] space-y-3 p-4 text-xs" align="center">
          <div className="flex items-center justify-between gap-2 text-muted-foreground">
            <span>{horaComSegundos(quando)}</span>
            {tool.ms !== undefined && <span>{tool.ms} ms</span>}
          </div>

          <div>
            <p className="font-medium">Nome</p>
            <p>
              {nome}
              {superAdmin && <span className="font-mono text-muted-foreground"> ({tool.name})</span>}
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-medium">Argumentos</p>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 font-mono text-[11px]">
              {jsonBonito(tool.args) || '{}'}
            </pre>
          </div>

          <div className="space-y-1">
            <p className="font-medium">Saída</p>
            <p className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2">
              {textoSaida(tool.result) || '(vazia)'}
            </p>
          </div>

          {tool.simulated && (
            <p className="flex items-start gap-1.5 text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Simulado: isso só acontece numa conversa de verdade. Nada foi feito agora.
            </p>
          )}

          {!tool.ok && tool.explicacao && (
            <div
              className={cn(
                'space-y-0.5 rounded-md p-2',
                tool.explicacao.nivel === 'normal' ? 'bg-muted/50' : 'bg-destructive/10 text-destructive'
              )}
            >
              <p>{tool.explicacao.motivo}</p>
              {tool.explicacao.oQueFazer && (
                <p>
                  <span className="font-medium">O que fazer: </span>
                  {tool.explicacao.oQueFazer}
                </p>
              )}
            </div>
          )}

          {superAdmin && tool.erro && (
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-md bg-destructive/10 p-2 font-mono text-[11px] text-destructive">
              {tool.erro}
            </pre>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Topo do teste: o que é de verdade, o que é simulado e o que falta. */
function AvisosDoTeste({ prontidao, isSuperAdmin }: { prontidao: Prontidao; isSuperAdmin: boolean }) {
  if (prontidao.bloqueio) {
    return (
      <div role="alert" className="flex items-start gap-2 bg-destructive/10 px-4 py-2.5 text-xs text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">{prontidao.bloqueio.titulo}</p>
          <p>{prontidao.bloqueio.oQueFazer}</p>
        </div>
      </div>
    );
  }
  const alteram = prontidao.ferramentas.filter((f) => !f.simulada && f.altera);
  const simuladas = prontidao.ferramentas.filter((f) => f.simulada);
  return (
    <div className="space-y-1.5 border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
      {alteram.length > 0 && (
        <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            As ferramentas rodam de verdade: {alteram.map((f) => f.label).join(', ')} acontecem mesmo, no nome do cliente do
            teste.
          </span>
        </p>
      )}
      {simuladas.length > 0 && (
        <p>Só simulado (acontece numa conversa real): {simuladas.map((f) => f.label).join(', ')}.</p>
      )}
      {prontidao.avisos.map((a) => (
        <p key={a} className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {a}
        </p>
      ))}
      {isSuperAdmin && prontidao.motor !== 'maestro' && (
        <p className="text-[11px]">
          (Suporte) Este WhatsApp atende hoje pelo fluxo antigo; o teste mostra como o Maestro responderia.
        </p>
      )}
      {isSuperAdmin && prontidao.prompt && <PromptCompleto prompt={prontidao.prompt} />}
    </div>
  );
}

/** Nome e telefone usados pelas ferramentas (ex.: a reserva sai nesse nome/telefone). */
function ClienteDoTeste({ cliente, onChange }: { cliente: ClienteTeste; onChange: (c: ClienteTeste) => void }) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(cliente);
  const telOk = telefoneValido(rascunho.telefone);

  if (!editando) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-4 py-2 text-xs text-muted-foreground">
        <User className="h-3.5 w-3.5 shrink-0" />
        <span>
          Cliente do teste: <span className="font-medium text-foreground">{cliente.nome || CLIENTE_PADRAO.nome}</span>
          {' · '}
          {cliente.telefone ? cliente.telefone : 'sem telefone (usa um número fictício)'}
        </span>
        <button
          type="button"
          onClick={() => {
            setRascunho(cliente);
            setEditando(true);
          }}
          className="inline-flex items-center gap-1 text-primary hover:underline max-sm:min-h-9"
        >
          <Pencil className="h-3 w-3" />
          alterar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 border-b px-4 py-3 text-xs">
      <p className="text-muted-foreground">
        As ferramentas usam este nome e telefone (ex.: a reserva de teste sai nele). Use o seu número para receber o que o
        sistema mandar.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Input
          value={rascunho.nome}
          onChange={(e) => setRascunho((r) => ({ ...r, nome: e.target.value.slice(0, 80) }))}
          placeholder="Nome do cliente"
          aria-label="Nome do cliente do teste"
        />
        <div className="space-y-1">
          <Input
            value={rascunho.telefone}
            onChange={(e) => setRascunho((r) => ({ ...r, telefone: e.target.value.slice(0, 25) }))}
            placeholder="Telefone com DDD (ex.: 5511999998888)"
            inputMode="tel"
            aria-label="Telefone do cliente do teste"
            aria-invalid={!telOk}
          />
          {!telOk && <p className="text-[11px] text-destructive">Use DDI + DDD + número (10 a 15 dígitos).</p>}
        </div>
        <Button
          size="sm"
          className="h-10"
          disabled={!telOk}
          onClick={() => {
            const novo = { nome: rascunho.nome.trim() || CLIENTE_PADRAO.nome, telefone: rascunho.telefone.replace(/\D/g, '') };
            onChange(novo);
            setEditando(false);
          }}
        >
          Pronto
        </Button>
      </div>
    </div>
  );
}

export function PlaygroundChat({ companyId, agentId, inboxId }: PlaygroundChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [cliente, setCliente] = useState<ClienteTeste>(CLIENTE_PADRAO);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { isSuperAdmin } = useAuth();
  const { configurations, isLoading: loadingConfig } = useAIConfigurations(
    agentId ? { companyId, agentId } : companyId
  );
  const agenteId = configurations?.[0]?.id ?? agentId ?? null;

  // Cliente do teste lembrado neste navegador.
  useEffect(() => {
    setCliente(lerCliente());
  }, []);

  // Conversa de teste lembrada neste navegador, por agente e WhatsApp. So grava
  // depois de carregar a da chave atual: senao a lista vazia do primeiro
  // render apagaria a conversa guardada.
  const chaveConversa = agenteId ? `${CHAVE_CONVERSA}:${agenteId}:${inboxId ?? 'geral'}` : null;
  const [conversaCarregada, setConversaCarregada] = useState<string | null>(null);
  useEffect(() => {
    if (!chaveConversa) return;
    setMessages(lerConversa(chaveConversa));
    setConversaCarregada(chaveConversa);
  }, [chaveConversa]);
  useEffect(() => {
    if (chaveConversa && conversaCarregada === chaveConversa) gravarConversa(chaveConversa, messages);
  }, [messages, chaveConversa, conversaCarregada]);

  const prontidao = useQuery({
    queryKey: ['maestro-playground', agenteId, inboxId ?? null],
    queryFn: async (): Promise<Prontidao> => {
      const params = new URLSearchParams({ agentId: agenteId ?? '' });
      if (inboxId) params.set('inboxId', inboxId);
      const res = await apiFetch(`/api/maestro/playground?${params.toString()}`);
      if (!res.ok) throw new Error(await mensagemDoServidor(res));
      return res.json();
    },
    enabled: !!agenteId,
  });

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, erro]);

  const handleNewSession = () => {
    setMessages([]);
    setInput('');
    setErro(null);
  };

  const trocarCliente = (c: ClienteTeste) => {
    setCliente(c);
    gravarCliente(c);
  };

  /** Pergunta à IA com a conversa até aqui; devolve os passos (ferramentas) e a resposta. */
  const responder = async (historico: Message[]): Promise<Message[]> => {
    if (!agenteId) throw new Error('Este WhatsApp ainda não tem agente de IA. Abra a aba "Agente de IA" e salve as instruções.');

    const res = await apiFetch('/api/maestro/playground', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: agenteId,
        ...(inboxId ? { inboxId } : {}),
        cliente: { nome: cliente.nome, ...(cliente.telefone ? { telefone: cliente.telefone } : {}) },
        // Só o que foi dito: os passos (ferramentas) não voltam como histórico.
        messages: historico
          .filter((m): m is Extract<Message, { role: 'user' | 'ai' }> => m.role !== 'tool')
          .map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content })),
      }),
    });
    if (!res.ok) throw new Error(await mensagemDoServidor(res));

    const parsed = maestroReplySchema.safeParse(await res.json());
    if (!parsed.success) throw new Error(ERRO_PADRAO);

    const agora = new Date();
    const passos: Message[] = parsed.data.tools.map((tool) => ({
      id: crypto.randomUUID(),
      role: 'tool',
      tool,
      timestamp: agora,
    }));
    // Um balão por mensagem, como o cliente recebe no WhatsApp.
    const partes = parsed.data.partes?.length ? parsed.data.partes : [parsed.data.reply || 'Sem resposta da IA.'];
    const baloes: Message[] = partes.map((texto, i) => ({
      id: crypto.randomUUID(),
      role: 'ai',
      content: texto,
      timestamp: agora,
      // Modelo e tempo só no último balão.
      ...(i === partes.length - 1 ? { model: parsed.data.model, ms: parsed.data.ms } : {}),
    }));
    return [...passos, ...baloes];
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
    const historico = [...messages, userMsg];

    setMessages(historico);
    setInput('');
    setErro(null);
    setIsLoading(true);

    try {
      const novas = await responder(historico);
      setMessages((prev) => [...prev, ...novas]);
    } catch (err) {
      console.error('Erro no teste da IA:', err);
      setErro(err instanceof Error && err.message ? err.message : ERRO_PADRAO);
      // A mensagem não foi respondida: devolve para a caixa, para tentar de novo.
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      setInput(text);
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

  if (loadingConfig || (!!agenteId && prontidao.isLoading)) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const bloqueado = !agenteId || !!prontidao.data?.bloqueio;

  return (
    <Card className="flex h-[75vh] min-h-[480px] flex-col overflow-hidden md:h-[680px]">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Bot className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <span className="block text-sm font-semibold">Testar a IA</span>
            <span className="block text-xs text-muted-foreground">
              Converse como se fosse um cliente. Cada ferramenta que a IA usar aparece na conversa.
            </span>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={handleNewSession} className="shrink-0 gap-1.5">
          <RotateCcw className="h-4 w-4" />
          Nova conversa
        </Button>
      </div>

      {!agenteId ? (
        <div role="alert" className="flex items-start gap-2 bg-destructive/10 px-4 py-2.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Este WhatsApp ainda não tem agente de IA. Abra a aba &quot;Agente de IA&quot; e salve as instruções.
        </div>
      ) : prontidao.isError ? (
        <div role="alert" className="flex items-start gap-2 bg-destructive/10 px-4 py-2.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {prontidao.error instanceof Error ? prontidao.error.message : ERRO_PADRAO}
        </div>
      ) : prontidao.data ? (
        <AvisosDoTeste prontidao={prontidao.data} isSuperAdmin={isSuperAdmin} />
      ) : null}

      {!bloqueado && <ClienteDoTeste cliente={cliente} onChange={trocarCliente} />}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
            <Bot className="h-12 w-12 opacity-30" />
            <p className="text-sm">Escreva uma mensagem como se fosse um cliente para testar a IA.</p>
            <p className="text-xs">Ex.: &quot;Oi, tem mesa pra 4 amanhã às 20h?&quot;</p>
          </div>
        )}

        <div className="space-y-3">
          {messages.map((msg) => {
            if (msg.role === 'tool') {
              return <PassoDaFerramenta key={msg.id} tool={msg.tool} quando={msg.timestamp} superAdmin={isSuperAdmin} />;
            }
            return (
              <div
                key={msg.id}
                className={cn(
                  'flex max-w-[92%] gap-3 sm:max-w-[85%]',
                  msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                )}
              >
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div
                  className={cn(
                    'min-w-0 rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'rounded-br-md bg-primary text-primary-foreground'
                      : 'rounded-bl-md bg-muted text-foreground'
                  )}
                >
                  {msg.role === 'ai' ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert [&>p]:m-0">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                  )}

                  <div className={cn('mt-1 text-[10px] opacity-60', msg.role === 'user' ? 'text-right' : 'text-left')}>
                    {msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    {isSuperAdmin && msg.role === 'ai' && (msg.model || msg.ms !== undefined) && (
                      <>
                        {msg.model ? ` · ${msg.model}` : ''}
                        {msg.ms !== undefined ? ` · ${msg.ms} ms` : ''}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="mr-auto flex max-w-[85%] gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3">
                <div className="flex gap-1.5">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/30 [animation-delay:0ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/30 [animation-delay:150ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/30 [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Erro da última tentativa */}
      {erro && (
        <div role="alert" className="flex items-start gap-2 border-t bg-destructive/10 px-4 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-medium">Não deu para responder: </span>
            {erro}
          </span>
        </div>
      )}

      {/* Input */}
      <div className="border-t p-3">
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={bloqueado ? 'O teste ainda não está liberado (veja o aviso acima)' : 'Escreva uma mensagem como se fosse um cliente…'}
            className="max-h-[120px] min-h-[44px] resize-none text-sm"
            rows={1}
            disabled={isLoading || bloqueado}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isLoading || bloqueado}
            className="h-[44px] w-[44px] shrink-0"
            aria-label="Enviar mensagem"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

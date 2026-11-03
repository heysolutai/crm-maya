'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Check, CheckCircle2, Clock, Copy, ExternalLink, Loader2, Settings2, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { DecisoesDaIA } from './DecisoesDaIA';
import { estadoDaAcao, resumoArgumentos, type ChamadaFerramenta } from './ferramentas';

/**
 * Aba "Logs da IA". No topo, "Decisoes da IA" (./DecisoesDaIA): o que a IA
 * fez com cada mensagem do cliente, em linguagem simples. Embaixo, os
 * "Detalhes tecnicos": execucoes do fluxo (n8n / Maestro) registradas pelo
 * proprio fluxo em POST /api/conversations/execution-url, uma por mensagem do
 * cliente. Serve pra achar rapido QUAL execucao respondeu (ou falhou) em cada
 * mensagem: thread, run, link e erro.
 *
 * No meio, "Acoes da IA": cada ferramenta que a IA chamou na conversa
 * (reserva, transferencia, base de conhecimento...), com a falha explicada em
 * palavras simples (src/lib/erros/ferramentas.ts). Erro cru so pro super-admin.
 */

interface ToolCallItem extends ChamadaFerramenta {
  /** Sistema externo (ex.: Reserve Maya); null = ferramenta do CRM. */
  sistema?: string | null;
  source: string;
  result: string | null;
  /** Texto técnico: só vem para o super-admin. */
  error: string | null;
  durationMs: number | null;
  httpStatus: number | null;
  runId: string | null;
}

interface ExecutionLogItem {
  id: string;
  provider: string;
  threadId: string | null;
  runId: string | null;
  executionUrl: string | null;
  status: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  message: { id: string; text: string; type: string | null; createdAt: string } | null;
}

interface ExecutionLogsResponse {
  threadId: string | null;
  data: ExecutionLogItem[];
  toolCalls?: ToolCallItem[];
}

const STATUS: Record<string, { label: string; icon: typeof Clock; className: string }> = {
  started: { label: 'Rodando', icon: Clock, className: 'text-amber-600 dark:text-amber-400' },
  success: { label: 'OK', icon: CheckCircle2, className: 'text-emerald-600 dark:text-emerald-400' },
  error: { label: 'Erro', icon: AlertCircle, className: 'text-destructive' },
};

const PROVIDER_LABEL: Record<string, string> = { n8n: 'n8n', maestro: 'Maestro' };

function formatarHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function previaMensagem(message: ExecutionLogItem['message']): string {
  if (!message) return 'Mensagem não identificada';
  if (message.text?.trim()) return message.text;
  const tipos: Record<string, string> = { audio: 'Áudio', ptt: 'Áudio', image: 'Imagem', video: 'Vídeo', document: 'Documento' };
  return `[${tipos[message.type || ''] || 'Mídia'}]`;
}

/** Id longo (thread/run) com botao de copiar: e o que se cola na busca do orquestrador. */
function IdCopiavel({ rotulo, valor }: { rotulo: string; valor: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // clipboard bloqueado: ignora
    }
  };
  return (
    <button
      type="button"
      onClick={copiar}
      title={`Copiar ${rotulo}`}
      className="flex w-full min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-accent/50 max-lg:min-h-9"
    >
      <span className="shrink-0 text-[11px] text-muted-foreground">{rotulo}</span>
      <span className="truncate font-mono text-[11px]">{valor}</span>
      {copiado ? (
        <Check className="ml-auto h-3 w-3 shrink-0 text-emerald-600" />
      ) : (
        <Copy className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
      )}
    </button>
  );
}

function formatarDuracao(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`;
}

function AcaoRow({ call, superAdmin }: { call: ToolCallItem; superAdmin: boolean }) {
  const [aberto, setAberto] = useState(false);
  const args = resumoArgumentos(call.arguments);
  const estado = estadoDaAcao(call);
  const Icone = estado.icone;
  const explicacao = call.ok ? null : call.explicacao;
  // O que o sistema devolveu pra IA ajuda a entender o que ela disse ao cliente.
  const mostrarResposta = !!call.result && (call.ok || superAdmin);

  return (
    <li className={cn('space-y-1 rounded-md border p-2', estado.caixa)}>
      <div className="flex items-center gap-1.5">
        <Icone className={cn('h-3.5 w-3.5 shrink-0', estado.classe)} aria-hidden />
        <span className="min-w-0 truncate text-[12px] font-medium" title={superAdmin ? call.toolName : undefined}>
          {call.label}
        </span>
        <span className={cn('shrink-0 text-[11px]', estado.classe)}>· {estado.rotulo}</span>
        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {formatarHora(call.createdAt)}
          {superAdmin && call.durationMs !== null && ` · ${formatarDuracao(call.durationMs)}`}
        </span>
      </div>

      {args && <p className="break-words font-mono text-[11px] text-muted-foreground">{args}</p>}

      {explicacao && (
        <div className="space-y-0.5 text-[12px]">
          <p>{explicacao.motivo}</p>
          {explicacao.oQueFazer && (
            <p>
              <span className="font-medium">O que fazer: </span>
              {explicacao.oQueFazer}
            </p>
          )}
        </div>
      )}

      {mostrarResposta && (
        <div>
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            className="text-[11px] text-primary hover:underline max-lg:min-h-9"
          >
            {aberto ? 'esconder resposta do sistema' : 'ver resposta do sistema'}
          </button>
          {aberto && (
            <p className="mt-1 whitespace-pre-wrap break-words rounded bg-muted/40 p-1.5 text-[12px]">{call.result}</p>
          )}
        </div>
      )}

      {superAdmin && call.error && (
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-destructive/10 p-1.5 font-mono text-[11px] text-destructive">
          {call.httpStatus ? `HTTP ${call.httpStatus} · ` : ''}
          {call.error}
        </pre>
      )}
    </li>
  );
}

/**
 * "Ações da IA": o que a IA tentou fazer nesta conversa (reservar, consultar
 * evento, transferir...) e se deu certo. Falha vem explicada em palavras
 * simples, com o que fazer; o erro técnico só o super-admin vê.
 */
function AcoesDaIA({ conversationId }: { conversationId: string }) {
  const { isSuperAdmin } = useAuth();
  const [todas, setTodas] = useState(false);
  const { data, isLoading, isError } = useExecutionLogs(conversationId);

  const calls = data?.toolCalls ?? [];
  const comProblema = calls.filter((c) => !c.ok && (c.explicacao?.nivel ?? 'problema') !== 'normal').length;
  const visiveis = todas ? calls : calls.slice(0, 5);

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex items-center gap-1.5">
        <Wrench className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <span className="text-[12px] font-medium">Ações da IA</span>
        {calls.length > 0 && (
          <span className="ml-auto text-[11px] text-muted-foreground">
            {calls.length}
            {comProblema > 0 && (
              <span className="text-red-600 dark:text-red-400">
                {' '}
                · {comProblema === 1 ? '1 com problema' : `${comProblema} com problema`}
              </span>
            )}
          </span>
        )}
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Carregando...
        </div>
      ) : isError && calls.length === 0 ? (
        <p className="text-[12px] text-destructive">Não foi possível carregar as ações da IA.</p>
      ) : calls.length === 0 ? (
        <p className="text-[12px] italic text-muted-foreground/70">
          A IA ainda não fez nenhuma ação nesta conversa (reserva, consulta, transferência...).
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {visiveis.map((call) => (
              <AcaoRow key={call.id} call={call} superAdmin={isSuperAdmin} />
            ))}
          </ul>
          {calls.length > 5 && (
            <button
              type="button"
              onClick={() => setTodas((v) => !v)}
              className="text-[11px] text-primary hover:underline max-lg:min-h-9"
            >
              {todas ? 'Mostrar menos' : `Mostrar todas (${calls.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Mesma chave que o tempo real invalida (execution:log -> ['execution-logs', id]). */
function useExecutionLogs(conversationId: string) {
  return useQuery({
    queryKey: ['execution-logs', conversationId],
    queryFn: async (): Promise<ExecutionLogsResponse> => {
      const res = await apiFetch(`/api/conversations/execution-logs?conversationId=${conversationId}`);
      if (!res.ok) throw new Error('Falha ao carregar logs');
      return res.json();
    },
    enabled: !!conversationId,
  });
}

/** Execuções do fluxo (parte técnica, pro suporte). */
function ExecucoesDoFluxo({ conversationId }: { conversationId: string }) {
  const [soErros, setSoErros] = useState(false);

  const { data, isLoading, isError } = useExecutionLogs(conversationId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Carregando logs...
      </div>
    );
  }
  if (isError || !data) {
    return <p className="text-[12px] text-destructive">Não foi possível carregar os logs.</p>;
  }

  const logs = data.data;
  const erros = logs.filter((l) => l.status === 'error').length;
  const visiveis = soErros ? logs.filter((l) => l.status === 'error') : logs;

  return (
    <div className="space-y-2">
      {data.threadId && <IdCopiavel rotulo="Thread atual" valor={data.threadId} />}

      {logs.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            {logs.length} execuç{logs.length === 1 ? 'ão' : 'ões'}
            {erros > 0 && <span className="text-destructive"> · {erros} com erro</span>}
          </span>
          {erros > 0 && (
            <button
              type="button"
              onClick={() => setSoErros((v) => !v)}
              className="text-[11px] text-primary hover:underline max-lg:min-h-9"
            >
              {soErros ? 'Mostrar todas' : 'Só erros'}
            </button>
          )}
        </div>
      )}

      {visiveis.length === 0 ? (
        <p className="text-[12px] italic text-muted-foreground/70">
          {logs.length === 0
            ? 'Nenhuma execução registrada. O fluxo registra cada execução em /api/conversations/execution-url.'
            : 'Nenhuma execução com erro.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {visiveis.map((log) => {
            const st = STATUS[log.status || ''];
            const Icone = st?.icon ?? Clock;
            const url = log.executionUrl && /^https:\/\//i.test(log.executionUrl) ? log.executionUrl : null;
            return (
              <li
                key={log.id}
                className={cn(
                  'space-y-1 rounded-md border p-2',
                  log.status === 'error' && 'border-destructive/40 bg-destructive/5'
                )}
              >
                <div className="flex items-center gap-1.5">
                  <Icone className={cn('h-3.5 w-3.5 shrink-0', st?.className ?? 'text-muted-foreground')} />
                  <span className={cn('text-[12px] font-medium', st?.className)}>{st?.label ?? 'Registrada'}</span>
                  <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                    {PROVIDER_LABEL[log.provider] ?? log.provider}
                  </Badge>
                  <span className="ml-auto text-[11px] text-muted-foreground">{formatarHora(log.createdAt)}</span>
                </div>

                <p className="line-clamp-2 text-[12px] text-muted-foreground" title={previaMensagem(log.message)}>
                  {previaMensagem(log.message)}
                </p>

                {log.runId && (
                  <IdCopiavel rotulo={log.provider === 'n8n' ? 'Execução' : 'Run'} valor={log.runId} />
                )}
                {log.threadId && log.threadId !== data.threadId && <IdCopiavel rotulo="Thread" valor={log.threadId} />}

                {log.errorMessage && (
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-destructive/10 p-1.5 font-mono text-[11px] text-destructive">
                    {log.errorMessage}
                  </pre>
                )}

                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline max-lg:min-h-9"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Abrir execução
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}

    </div>
  );
}

export function ExecutionLogs({ conversationId }: { conversationId: string }) {
  return (
    <div className="space-y-4">
      <DecisoesDaIA conversationId={conversationId} />

      <AcoesDaIA conversationId={conversationId} />

      <div className="space-y-2 border-t pt-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <Settings2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-[12px] font-medium">Detalhes técnicos</span>
          </div>
          <p className="text-[11px] text-muted-foreground">Para o suporte: execuções do fluxo de IA desta conversa.</p>
        </div>
        <ExecucoesDoFluxo conversationId={conversationId} />
      </div>
    </div>
  );
}

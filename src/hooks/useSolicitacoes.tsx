'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { CardSolicitacao, RegraApi } from '@/lib/solicitacoes/api';
import type { Etapa, Funil } from '@/lib/solicitacoes/funis';

export type { CardSolicitacao, RegraApi };

export interface ResumoSolicitacoes {
  noMes: number;
  abertasAgora: number;
  porCategoria: { categoria: string; total: number }[];
  tempoMedioAtendimentoMin: number | null;
  fechadosNoMes: number;
  valorFechadoNoMes: number;
  valorEmAberto: number;
}

export interface QuadroSolicitacoes {
  funil: Funil;
  periodo: { desde: string; ate: string };
  etapas: Etapa[];
  itens: CardSolicitacao[];
  resumo: ResumoSolicitacoes;
  equipe: { id: string; name: string }[];
}

/** Erro com a mensagem que a API devolveu (pronta para o toast). */
async function erroDaResposta(res: Response, padrao: string): Promise<Error> {
  const data: unknown = await res.json().catch(() => null);
  if (data && typeof data === 'object') {
    const d = data as { error?: unknown; details?: unknown };
    if (d.details && typeof d.details === 'object') {
      const primeiro = Object.values(d.details as Record<string, unknown>).flat().find((v) => typeof v === 'string');
      if (typeof primeiro === 'string') return new Error(primeiro);
    }
    if (typeof d.error === 'string' && d.error) return new Error(d.error);
  }
  return new Error(padrao);
}

async function json<T>(res: Response, padrao: string): Promise<T> {
  if (!res.ok) throw await erroDaResposta(res, padrao);
  return res.json() as Promise<T>;
}

const CHAVE = 'solicitacoes';
const CHAVE_REGRAS = 'solicitacoes-regras';

/** Período do CRM em dias de São Paulo (AAAA-MM-DD, inclusivo). */
export interface PeriodoCRM {
  desde: string;
  ate: string;
}

export function useQuadroSolicitacoes(funil: Funil, busca: string, periodo: PeriodoCRM) {
  return useQuery({
    queryKey: [CHAVE, funil, busca, periodo.desde, periodo.ate],
    // Trocar o período mantém o quadro anterior na tela até o novo chegar.
    placeholderData: (anterior) => anterior,
    queryFn: async () => {
      const qs = new URLSearchParams({
        funil,
        desde: periodo.desde,
        ate: periodo.ate,
        ...(busca.trim() ? { busca: busca.trim() } : {}),
      });
      return json<QuadroSolicitacoes>(await apiFetch(`/api/solicitacoes?${qs}`), 'Não foi possível carregar as solicitações.');
    },
    // A IA abre solicitações a qualquer momento: o quadro se atualiza sozinho.
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });
}

export function useAcoesSolicitacao() {
  const qc = useQueryClient();
  const recarregar = () => qc.invalidateQueries({ queryKey: [CHAVE] });

  const atualizar = useMutation({
    mutationFn: async ({ id, ...dados }: { id: string; stage?: string; assignedTo?: string | null; estimatedValue?: number | null; summary?: string | null }) =>
      json<CardSolicitacao>(
        await apiFetch(`/api/solicitacoes/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dados),
        }),
        'Não foi possível salvar.'
      ),
    // Mover de etapa aparece na hora; se falhar, o quadro volta ao recarregar.
    onMutate: async ({ id, stage }) => {
      if (!stage) return;
      await qc.cancelQueries({ queryKey: [CHAVE] });
      qc.setQueriesData<QuadroSolicitacoes>({ queryKey: [CHAVE] }, (q) =>
        q ? { ...q, itens: q.itens.map((i) => (i.id === id ? { ...i, stage } : i)) } : q
      );
    },
    onSettled: recarregar,
  });

  const criar = useMutation({
    mutationFn: async (dados: { funil: Funil; ruleId?: string; nome: string; telefone?: string; resumo?: string; valor?: number | null }) =>
      json<CardSolicitacao>(
        await apiFetch('/api/solicitacoes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dados),
        }),
        'Não foi possível criar a solicitação.'
      ),
    onSuccess: recarregar,
  });

  const apagar = useMutation({
    mutationFn: async (id: string) =>
      json<{ success: boolean }>(await apiFetch(`/api/solicitacoes/${id}`, { method: 'DELETE' }), 'Não foi possível apagar.'),
    onSuccess: recarregar,
  });

  const adicionarConhecimento = useMutation({
    mutationFn: async ({ id, ...dados }: { id: string; pergunta: string; resposta: string; resolver: boolean }) =>
      json<{ success: boolean; indexada: boolean }>(
        await apiFetch(`/api/solicitacoes/${id}/conhecimento`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dados),
        }),
        'Não foi possível adicionar à base de conhecimento.'
      ),
    onSuccess: recarregar,
  });

  return { atualizar, criar, apagar, adicionarConhecimento };
}

/**
 * Conversa da solicitação dentro da plataforma: acha a do cliente (ou abre
 * uma) e deixa o card ligado a ela. Usado pelo ícone do WhatsApp quando o
 * card ainda não tem conversa (ex.: criado à mão).
 */
export function useAbrirConversaDaSolicitacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      json<{ conversationId: string }>(
        await apiFetch(`/api/solicitacoes/${id}/conversa`, { method: 'POST' }),
        'Não foi possível abrir a conversa.'
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CHAVE] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export type RegraEditavel = Pick<
  RegraApi,
  | 'funnel'
  | 'name'
  | 'tag'
  | 'trigger'
  | 'notWhen'
  | 'examples'
  | 'collectFields'
  | 'askMessage'
  | 'flowMode'
  | 'introMessage'
  | 'introImages'
  | 'responseMessage'
  | 'responseMode'
  | 'pauseAi'
  | 'notifyPhones'
  | 'isActive'
>;

/** Sobe uma foto (JPG, PNG ou WebP, até 5 MB) e devolve a URL pública. */
export async function enviarFoto(arquivo: File): Promise<string> {
  const form = new FormData();
  form.append('file', arquivo);
  const r = await json<{ url: string }>(await apiFetch('/api/events/upload', { method: 'POST', body: form }), 'Não foi possível enviar a foto.');
  return r.url;
}

export interface ConexaoAviso {
  id: string;
  nome: string;
  oficial: boolean;
  conectada: boolean;
  telefone: string | null;
}

export interface ConfigAviso {
  funil: Funil;
  enabled: boolean;
  inboxId: string | null;
  phones: string[];
  templateName: string | null;
  templateLanguage: string;
}

/** Aviso no WhatsApp da equipe do funil (CRM › Regras). */
export function useAvisoEquipe(funil: Funil, ativo: boolean) {
  const qc = useQueryClient();
  const chave = ['solicitacoes-aviso', funil];

  const config = useQuery({
    queryKey: chave,
    enabled: ativo,
    queryFn: async () =>
      json<ConfigAviso & { conexoes: ConexaoAviso[]; templateSugerido: string }>(
        await apiFetch(`/api/solicitacoes/avisos?funil=${funil}`),
        'Não foi possível carregar o aviso.'
      ),
  });

  const salvar = useMutation({
    mutationFn: async (dados: ConfigAviso) =>
      json<ConfigAviso>(
        await apiFetch('/api/solicitacoes/avisos', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dados),
        }),
        'Não foi possível salvar o aviso.'
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: chave }),
  });

  const testar = useMutation({
    mutationFn: async () =>
      json<{ ok: boolean; mensagem: string }>(
        await apiFetch('/api/solicitacoes/avisos/teste', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ funil }),
        }),
        'Não foi possível enviar o teste.'
      ),
  });

  return { config, salvar, testar };
}

export function useRegrasEncaminhamento() {
  const qc = useQueryClient();
  const recarregar = () => {
    qc.invalidateQueries({ queryKey: [CHAVE_REGRAS] });
    // A IA lê as regras pelas ferramentas: a aba Ferramentas também muda.
    qc.invalidateQueries({ queryKey: ['ai-tools'] });
  };

  const lista = useQuery({
    queryKey: [CHAVE_REGRAS],
    queryFn: async () =>
      (await json<{ regras: RegraApi[] }>(await apiFetch('/api/solicitacoes/regras'), 'Não foi possível carregar as regras.')).regras,
  });

  const salvar = useMutation({
    mutationFn: async ({ id, ...dados }: Partial<RegraEditavel> & { id: string }) =>
      json<RegraApi>(
        await apiFetch(`/api/solicitacoes/regras/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dados),
        }),
        'Não foi possível salvar a regra.'
      ),
    onSuccess: recarregar,
  });

  const criar = useMutation({
    mutationFn: async (dados: RegraEditavel) =>
      json<RegraApi>(
        await apiFetch('/api/solicitacoes/regras', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dados),
        }),
        'Não foi possível criar a regra.'
      ),
    onSuccess: recarregar,
  });

  const apagar = useMutation({
    mutationFn: async (id: string) =>
      json<{ success: boolean }>(await apiFetch(`/api/solicitacoes/regras/${id}`, { method: 'DELETE' }), 'Não foi possível apagar a regra.'),
    onSuccess: recarregar,
  });

  return { lista, salvar, criar, apagar };
}

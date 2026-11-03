import { AlertCircle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react';
import type { FalhaFerramentaExplicada } from '@/lib/erros/ferramentas';

/**
 * Ferramentas que a IA usou numa conversa (AiToolCall): o que o chat mostra
 * entre as mensagens e a base do que "Logs da IA" > "Ações da IA" mostra.
 */

export interface ChamadaFerramenta {
  id: string;
  toolName: string;
  /** Nome amigável ("Consultar disponibilidade"). */
  label: string;
  ok: boolean;
  /** Falha em palavras simples (null quando deu certo). */
  explicacao?: FalhaFerramentaExplicada | null;
  arguments: unknown;
  createdAt: string;
}

/** Ferramentas seguidas, sem mensagem no meio: uma linha só no chat. */
export interface GrupoFerramentas {
  id: string;
  _isFerramentas: true;
  created_at: string;
  chamadas: ChamadaFerramenta[];
}

/** Argumentos em uma linha: "date: 2026-10-08 · people: 2". */
export function resumoArgumentos(args: unknown): string {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return '';
  const texto = Object.entries(args as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
  return texto.length > 300 ? `${texto.slice(0, 300)}…` : texto;
}

/** Cor e rótulo de cada ação, pelo resultado. */
export function estadoDaAcao(call: Pick<ChamadaFerramenta, 'ok' | 'explicacao'>): {
  rotulo: string;
  icone: LucideIcon;
  classe: string;
  caixa: string;
} {
  if (call.ok) {
    return { rotulo: 'Deu certo', icone: CheckCircle2, classe: 'text-emerald-600 dark:text-emerald-400', caixa: '' };
  }
  const nivel = call.explicacao?.nivel ?? 'problema';
  if (nivel === 'normal') {
    return { rotulo: 'Não feito', icone: Info, classe: 'text-muted-foreground', caixa: 'bg-muted/30' };
  }
  if (nivel === 'aviso') {
    return {
      rotulo: 'Atenção',
      icone: AlertCircle,
      classe: 'text-amber-600 dark:text-amber-400',
      caixa: 'border-amber-500/40 bg-amber-500/5',
    };
  }
  return { rotulo: 'Falhou', icone: XCircle, classe: 'text-destructive', caixa: 'border-destructive/40 bg-destructive/5' };
}

type ItemComData = { created_at?: string | null; createdAt?: string | null };

function tempoDe(item: ItemComData): number {
  return new Date(item.created_at || item.createdAt || 0).getTime();
}

/**
 * Encaixa as ferramentas entre as mensagens (já em ordem crescente), pelo
 * horário: ficam entre a mensagem do cliente e a resposta da IA. Com mensagens
 * antigas ainda por carregar, só entram as do trecho já carregado (senão
 * apareceriam todas amontoadas no topo).
 */
export function intercalarFerramentas<T extends ItemComData>(
  mensagens: T[],
  chamadas: ChamadaFerramenta[] | undefined,
  temMaisAntigas: boolean
): (T | GrupoFerramentas)[] {
  if (!chamadas?.length || mensagens.length === 0) return mensagens;

  const inicio = temMaisAntigas ? tempoDe(mensagens[0]) : -Infinity;
  const visiveis = chamadas.filter((c) => tempoDe(c) >= inicio);
  if (visiveis.length === 0) return mensagens;

  const itens: (T | GrupoFerramentas)[] = [];
  let pendentes: ChamadaFerramenta[] = [];
  const fecharGrupo = () => {
    if (pendentes.length === 0) return;
    // id da primeira: estável quando chega mais uma no mesmo grupo (o virtualizer reaproveita a medida).
    itens.push({ id: `ferramentas:${pendentes[0].id}`, _isFerramentas: true, created_at: pendentes[0].createdAt, chamadas: pendentes });
    pendentes = [];
  };

  let j = 0;
  for (const m of mensagens) {
    const t = tempoDe(m);
    while (j < visiveis.length && tempoDe(visiveis[j]) < t) pendentes.push(visiveis[j++]);
    fecharGrupo();
    itens.push(m);
  }
  while (j < visiveis.length) pendentes.push(visiveis[j++]);
  fecharGrupo();
  return itens;
}

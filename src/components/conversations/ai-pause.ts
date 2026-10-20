/**
 * Regras da pausa da IA do lado do navegador.
 *
 * Espelha `isAiPausedNow` de `@/lib/ai/pause` (que nao pode ser importado aqui:
 * aquele arquivo puxa o Prisma). A pausa expira sozinha: `ai_paused` pode
 * continuar true no banco com o prazo ja vencido — e isso conta como IA ativa.
 */

export interface AiPauseClientState {
  ai_paused?: boolean | null;
  ai_paused_until?: string | null;
}

export function isAiPausedNow(state: AiPauseClientState | null | undefined, now: number = Date.now()): boolean {
  if (!state?.ai_paused) return false;
  if (!state.ai_paused_until) return true; // sem prazo: so volta manual
  const ate = new Date(state.ai_paused_until).getTime();
  if (Number.isNaN(ate)) return true;
  return ate > now;
}

/** Minutos restantes (arredonda pra cima: 30s restantes = "1 min"). */
export function minutosRestantes(until: string, now: number = Date.now()): number {
  const ms = new Date(until).getTime() - now;
  return Math.max(0, Math.ceil(ms / 60_000));
}

/** "12 min", "1h", "1h 05min". */
export function formatarDuracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}min`;
}

/** "14:35" hoje, "05/10 14:35" em outro dia. */
export function formatarHorario(iso: string, now: number = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const mesmoDia = new Date(now).toDateString() === d.toDateString();
  if (mesmoDia) return hora;
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora}`;
}

/**
 * Quem pausou, pronto pra frase "Pausada {rotulo}".
 * `ai_paused_by` guarda o id do usuario, ou 'phone' / 'agent' / 'system'.
 */
export function rotuloQuemPausou(
  pausedBy: string | null | undefined,
  equipe: { id: string; full_name?: string | null }[] = [],
): string | null {
  if (!pausedBy) return null;
  if (pausedBy === 'phone') return 'pelo celular';
  if (pausedBy === 'system' || pausedBy === 'ai') return 'pelo sistema';
  if (pausedBy === 'agent') return 'por um atendente';
  const nome = equipe.find((m) => m.id === pausedBy)?.full_name?.trim();
  return nome ? `por ${nome}` : 'por um atendente';
}

/** Opcoes fixas do menu "Pausar IA". `minutes: null` = ate retomar. */
export const OPCOES_PAUSA: { label: string; minutes: number | null }[] = [
  { label: 'Pausar por 15 min', minutes: 15 },
  { label: 'Pausar por 1 hora', minutes: 60 },
];

/** Prazo otimista: o servidor devolve o oficial logo em seguida. */
export function prazoOtimista(minutes: number | null | undefined, padrao: number | null | undefined): string | null {
  const efetivo = minutes === undefined ? padrao : minutes;
  if (!efetivo || efetivo <= 0) return null;
  return new Date(Date.now() + efetivo * 60_000).toISOString();
}

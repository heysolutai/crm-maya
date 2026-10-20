import { format } from 'date-fns';

/** "07/10 14:32". Vazio se a data for inválida. */
export function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return format(d, 'dd/MM HH:mm');
}

/** "respondeu em 12 s" / "respondeu em 2 min 5 s". */
export function textoTempoResposta(ms: number): string {
  if (ms < 1000) return 'respondeu em menos de 1 s';
  const segundos = Math.round(ms / 1000);
  if (segundos < 60) return `respondeu em ${segundos} s`;
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return resto > 0 ? `respondeu em ${minutos} min ${resto} s` : `respondeu em ${minutos} min`;
}

/** Quantas respostas da IA foram barradas porque ela estava pausada. */
export function textoBloqueios(bloqueios: number): string {
  return bloqueios === 1
    ? 'A IA tentou responder 1 vez enquanto estava pausada, e a resposta não foi enviada ao cliente.'
    : `A IA tentou responder ${bloqueios} vezes enquanto estava pausada, e as respostas não foram enviadas ao cliente.`;
}

/** "(3 mensagens)" quando o cliente mandou várias mensagens seguidas. */
export function textoQuantidadeMensagens(mensagens: number): string | null {
  return mensagens > 1 ? `(${mensagens} mensagens)` : null;
}

/** Telefone brasileiro legível: "+55 (11) 98765-4321". */
export function formatarTelefone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}

/** Link que abre a conversa no Atendimentos. */
export function linkConversa(conversationId: string): string {
  return `/app/conversations?conversation=${encodeURIComponent(conversationId)}`;
}

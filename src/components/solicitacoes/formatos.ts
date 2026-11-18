import { formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function emReais(valor: number | null | undefined): string {
  return valor == null ? '' : moeda.format(valor);
}

/** "há 5 min", "há 2 h", "há 3 dias" */
export function haQuanto(iso: string): string {
  try {
    return `há ${formatDistanceToNowStrict(new Date(iso), { locale: ptBR })}`
      .replace(' minutos', ' min')
      .replace(' minuto', ' min')
      .replace(' horas', ' h')
      .replace(' hora', ' h')
      .replace(' segundos', ' s');
  } catch {
    return '';
  }
}

export function dataHora(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 14 -> "14 min", 130 -> "2 h 10 min", 3000 -> "2 dias" */
export function duracao(min: number | null | undefined): string {
  if (min == null) return '—';
  if (min < 60) return `${min} min`;
  if (min < 24 * 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  const d = Math.round(min / (24 * 60));
  return d === 1 ? '1 dia' : `${d} dias`;
}

/** 5541998679696 -> (41) 99867-9696 */
export function telefone(digitos: string | null | undefined): string {
  if (!digitos) return '';
  const d0 = digitos.replace(/\D/g, '');
  const d = d0.length >= 12 && d0.startsWith('55') ? d0.slice(2) : d0;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digitos;
}

/** Valor de dado coletado: "2026-12-12" vira "12/12/2026". */
export function valorDoDado(v: string | number): string {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split('-').reverse().join('/');
  return String(v);
}

export function iniciais(nome: string | null | undefined): string {
  const partes = (nome || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  return ((partes[0][0] || '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

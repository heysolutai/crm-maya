/**
 * Visual do CRM: minimalista. Neutros + a cor da marca (primary) e uma
 * paleta curta de tons BEM suaves (4–6% de cor) só para dar vida: cada etapa
 * e cada número tem o seu tom, com um contorno "neon" discreto na mesma cor.
 * Classes completas escritas aqui para o Tailwind gerar.
 */

export interface Cor {
  /** Pílula (fundo suave + texto). */
  pilula: string;
  /** Bolinha. */
  ponto: string;
}

export interface Tom extends Cor {
  /** Círculo do ícone (cards de número). */
  icone: string;
  /** Avatar com as iniciais (card do quadro, lista). */
  avatar: string;
  /** Fundo da coluna do quadro. */
  coluna: string;
  /** Card de número: fundo com um véu da cor + contorno neon da cor. */
  cartao: string;
  /** Barra de progresso. */
  barra: string;
}

export type NomeTom = 'azul' | 'violeta' | 'ambar' | 'verde' | 'neutro';

/** Contorno neon suave (cartões em destaque). */
export const NEON =
  'border-primary/20 shadow-[0_0_0_1px_hsl(var(--primary)/0.05),0_8px_30px_-16px_hsl(var(--primary)/0.45)]';

/** Neon ao passar o mouse (cartões clicáveis). */
export const NEON_HOVER =
  'transition-[box-shadow,border-color,transform] hover:-translate-y-px hover:border-primary/40 hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.10),0_10px_32px_-14px_hsl(var(--primary)/0.55)]';

export const TONS: Record<NomeTom, Tom> = {
  azul: {
    pilula: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
    ponto: 'bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.7)]',
    icone: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    avatar: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
    coluna: 'bg-sky-500/[0.04] dark:bg-sky-400/[0.05]',
    cartao:
      'border-sky-500/20 bg-gradient-to-br from-sky-500/[0.06] via-transparent to-transparent shadow-[0_0_0_1px_rgba(14,165,233,0.05),0_8px_30px_-16px_rgba(14,165,233,0.45)]',
    barra: 'bg-sky-500/70',
  },
  violeta: {
    pilula: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
    ponto: 'bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.7)]',
    icone: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    avatar: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
    coluna: 'bg-violet-500/[0.04] dark:bg-violet-400/[0.05]',
    cartao:
      'border-violet-500/20 bg-gradient-to-br from-violet-500/[0.06] via-transparent to-transparent shadow-[0_0_0_1px_rgba(139,92,246,0.05),0_8px_30px_-16px_rgba(139,92,246,0.45)]',
    barra: 'bg-violet-500/70',
  },
  ambar: {
    pilula: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    ponto: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.7)]',
    icone: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    avatar: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    coluna: 'bg-amber-500/[0.04] dark:bg-amber-400/[0.05]',
    cartao:
      'border-amber-500/20 bg-gradient-to-br from-amber-500/[0.06] via-transparent to-transparent shadow-[0_0_0_1px_rgba(245,158,11,0.05),0_8px_30px_-16px_rgba(245,158,11,0.45)]',
    barra: 'bg-amber-500/70',
  },
  verde: {
    pilula: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    ponto: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]',
    icone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    avatar: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    coluna: 'bg-emerald-500/[0.04] dark:bg-emerald-400/[0.05]',
    cartao:
      'border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.06] via-transparent to-transparent shadow-[0_0_0_1px_rgba(16,185,129,0.05),0_8px_30px_-16px_rgba(16,185,129,0.45)]',
    barra: 'bg-emerald-500/70',
  },
  neutro: {
    pilula: 'bg-muted text-foreground/70',
    ponto: 'bg-muted-foreground/50',
    icone: 'bg-muted text-muted-foreground',
    avatar: 'bg-muted text-foreground/80',
    coluna: 'bg-muted/40',
    cartao: NEON,
    barra: 'bg-muted-foreground/50',
  },
};

const NEUTRA: Cor = { pilula: TONS.neutro.pilula, ponto: TONS.neutro.ponto };

/** Categoria: sempre neutra (o nome já diz o que é; cor demais vira circo). */
export function corDaCategoria(_nome: string): Cor {
  return NEUTRA;
}

/** Tom de cada etapa, na ordem do funil (as chaves não se repetem entre funis). */
const TOM_DA_ETAPA: Record<string, NomeTom> = {
  // Eventos personalizados
  novo: 'azul',
  em_contato: 'violeta',
  proposta: 'ambar',
  fechado: 'verde',
  perdido: 'neutro',
  // Atendimento humano
  aguardando: 'ambar',
  em_atendimento: 'azul',
  resolvido: 'verde',
};

export function corDaEtapa(key: string): Tom {
  return TONS[TOM_DA_ETAPA[key] ?? 'azul'];
}

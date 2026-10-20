import { AlertCircle, AlertTriangle, CheckCircle2, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ExplicacaoIA, NivelIA } from './types';

const ESTILO: Record<NivelIA, { icone: LucideIcon; className: string }> = {
  ok: {
    icone: CheckCircle2,
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  },
  aviso: {
    icone: AlertTriangle,
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
  problema: {
    icone: AlertCircle,
    className: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400',
  },
};

/** Cor da borda/fundo do item conforme o nível (problema destaca em vermelho). */
export function classeNivel(nivel: NivelIA): string {
  if (nivel === 'problema') return 'border-red-500/30 bg-red-500/[0.03] dark:bg-red-500/[0.06]';
  return '';
}

/** Resultado do turno ("Respondida", "Sem resposta"...) com a cor do nível. */
export function ResultadoBadge({
  explicacao,
  compacto = false,
  className,
}: {
  explicacao: ExplicacaoIA;
  compacto?: boolean;
  className?: string;
}) {
  const estilo = ESTILO[explicacao.nivel] ?? ESTILO.aviso;
  const Icone = estilo.icone;
  return (
    <Badge
      variant="outline"
      className={cn(
        'shrink-0 gap-1 whitespace-nowrap font-medium',
        compacto ? 'h-5 px-1.5 text-[11px]' : 'px-2 py-0.5 text-xs',
        estilo.className,
        className
      )}
    >
      <Icone className={compacto ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden />
      {explicacao.resultado}
    </Badge>
  );
}

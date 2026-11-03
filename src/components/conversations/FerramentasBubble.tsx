import { memo, useState } from 'react';
import { Wrench } from 'lucide-react';
import { cn, formatMessageTime } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { estadoDaAcao, resumoArgumentos, type ChamadaFerramenta, type GrupoFerramentas } from './ferramentas';

function Detalhe({ chamada }: { chamada: ChamadaFerramenta }) {
  const args = resumoArgumentos(chamada.arguments);
  const explicacao = chamada.ok ? null : chamada.explicacao;
  const hora = formatMessageTime(chamada.createdAt);

  return (
    <div className="w-full max-w-md space-y-1 rounded-md border bg-background px-3 py-2 text-[12px] leading-snug shadow-sm">
      <p className="text-[11px] text-muted-foreground">
        A IA usou “{chamada.label}”{hora ? ` às ${hora}` : ''}
      </p>
      {args && <p className="break-words font-mono text-[11px] text-muted-foreground">{args}</p>}
      {explicacao && (
        <>
          <p>{explicacao.motivo}</p>
          {explicacao.oQueFazer && (
            <p>
              <span className="font-medium">O que fazer: </span>
              {explicacao.oQueFazer}
            </p>
          )}
        </>
      )}
    </div>
  );
}

interface FerramentasBubbleProps {
  grupo: GrupoFerramentas;
}

/**
 * Ferramentas que a IA usou no meio da conversa (consultar disponibilidade,
 * fazer reserva...), entre a mensagem do cliente e a resposta da IA: uma linha
 * discreta. Clicar abre com que dados a IA chamou e, se falhou, o porquê.
 * A lista completa fica no painel, em "Logs da IA" > "Ações da IA".
 */
export const FerramentasBubble = memo(function FerramentasBubble({ grupo }: FerramentasBubbleProps) {
  const { isSuperAdmin } = useAuth();
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const aberta = grupo.chamadas.find((c) => c.id === abertaId) ?? null;

  return (
    <div className="flex flex-col items-center gap-1.5 px-4">
      <div className="flex max-w-[85%] flex-wrap items-center justify-center gap-1.5">
        {grupo.chamadas.map((c) => {
          const estado = estadoDaAcao(c);
          const Icone = estado.icone;
          return (
            // Deu certo: só o ✓ verde. Não deu: o resultado escrito, na cor dele.
            <button
              key={c.id}
              type="button"
              onClick={() => setAbertaId((v) => (v === c.id ? null : c.id))}
              aria-expanded={c.id === abertaId}
              title={isSuperAdmin ? c.toolName : 'Ferramenta usada pela IA'}
              className={cn(
                'inline-flex max-w-full items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                estado.caixa
              )}
            >
              <Wrench className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate font-medium text-foreground/80">{c.label}</span>
              {c.ok ? (
                <Icone className={cn('h-3 w-3 shrink-0', estado.classe)} aria-label={estado.rotulo} />
              ) : (
                <span className={cn('shrink-0', estado.classe)}>· {estado.rotulo.toLowerCase()}</span>
              )}
            </button>
          );
        })}
      </div>
      {aberta && <Detalhe chamada={aberta} />}
    </div>
  );
});

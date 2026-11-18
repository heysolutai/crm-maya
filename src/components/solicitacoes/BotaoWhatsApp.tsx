'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAbrirConversaDaSolicitacao } from '@/hooks/useSolicitacoes';
import { cn } from '@/lib/utils';
import { WhatsAppLogo } from './WhatsAppPreview';

interface Props {
  /** Id da solicitação (para achar ou abrir a conversa quando o card ainda não tem). */
  solicitacaoId: string;
  conversationId: string | null;
  telefone: string | null;
  clientId?: string | null;
  /** 'sm' no card e na lista; 'md' no detalhe. */
  tamanho?: 'sm' | 'md';
  className?: string;
}

// Dentro do card (que é arrastável e clicável): o clique/Enter aqui não abre o card nem começa a arrastar.
const parar = (e: MouseEvent | PointerEvent | KeyboardEvent) => e.stopPropagation();

const ROTULO = 'Abrir a conversa em Atendimentos';

/**
 * Ícone do WhatsApp (verde) que abre a conversa do cliente DENTRO da
 * plataforma (Atendimentos), nunca o WhatsApp de fora. Card sem conversa
 * (ex.: criado à mão): acha a conversa do cliente pelo telefone ou abre uma.
 */
export function BotaoWhatsApp({ solicitacaoId, conversationId, telefone, clientId, tamanho = 'sm', className }: Props) {
  const router = useRouter();
  const abrir = useAbrirConversaDaSolicitacao();
  if (!conversationId && !telefone && !clientId) return null;

  const classe = cn(
    'inline-flex shrink-0 items-center justify-center rounded-full border border-transparent text-[#25D366] transition-colors hover:border-[#25D366]/30 hover:bg-[#25D366]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/50 disabled:opacity-60',
    tamanho === 'md' ? 'h-10 w-10' : 'h-8 w-8',
    className
  );
  const tamanhoIcone = tamanho === 'md' ? 'h-[22px] w-[22px]' : 'h-[18px] w-[18px]';
  const icone = <WhatsAppLogo className={tamanhoIcone} />;

  if (conversationId) {
    return (
      <Link
        href={`/app/conversations?conversation=${conversationId}`}
        onClick={parar}
        onPointerDown={parar}
        onKeyDown={parar}
        title={ROTULO}
        aria-label={ROTULO}
        className={classe}
      >
        {icone}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onPointerDown={parar}
      onKeyDown={parar}
      onClick={(e) => {
        parar(e);
        abrir.mutate(solicitacaoId, {
          onSuccess: ({ conversationId: id }) => router.push(`/app/conversations?conversation=${id}`),
          onError: (err) => toast.error(err.message),
        });
      }}
      disabled={abrir.isPending}
      title={ROTULO}
      aria-label={ROTULO}
      className={classe}
    >
      {abrir.isPending ? <Loader2 className={cn(tamanhoIcone, 'animate-spin')} /> : icone}
    </button>
  );
}

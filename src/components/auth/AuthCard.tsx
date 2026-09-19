'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useBranding } from '@/hooks/useBranding';

interface Props {
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
  /** Link de volta pro login no rodape. */
  mostrarVoltar?: boolean;
}

/**
 * Moldura das telas soltas de autenticacao (recuperar senha, definir senha).
 *
 * A tela de login tem o painel de marca ao lado; aqui a pessoa chegou por um
 * link de e-mail com uma tarefa unica, entao o cartao fica centralizado e sem
 * nada que desvie do que ela veio fazer.
 */
export function AuthCard({ titulo, descricao, children, mostrarVoltar = true }: Props) {
  const { branding } = useBranding();
  const inicial = (branding.systemName || 'M').trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-surface px-4 py-12">
      {/* Mesmo glow do painel de marca do login, em escala menor */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] bg-brand-primary/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        <div className="flex justify-center mb-8">
          {branding.logoUrl ? (
            <Image
              src={branding.logoUrl}
              alt={branding.systemName || 'Maya'}
              width={160}
              height={48}
              className="h-12 w-auto object-contain"
              unoptimized
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-brand-light flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-primary/25">
              {inicial}
            </div>
          )}
        </div>

        <div className="bg-background border border-border/60 rounded-2xl shadow-xl shadow-black/5 p-8">
          <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
          {descricao && <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{descricao}</p>}

          <div className="mt-6">{children}</div>
        </div>

        {mostrarVoltar && (
          <div className="mt-6 flex justify-center">
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar para o login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

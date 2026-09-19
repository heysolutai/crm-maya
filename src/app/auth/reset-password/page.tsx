'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthCard } from '@/components/auth/AuthCard';
import { Eye, EyeOff, Loader2, Lock, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

/** O mesmo link serve pra recuperar senha e pra aceitar convite. */
type TipoToken = 'password_reset' | 'invite';

interface TokenChecado {
  valido: boolean;
  tipo?: TipoToken;
  email?: string;
  nome?: string | null;
}

const MIN_SENHA = 6;

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [checando, setChecando] = useState(true);
  const [checado, setChecado] = useState<TokenChecado>({ valido: false });
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Confere o link ANTES de pedir a senha: quem clicou num link vencido merece
  // saber disso de cara, e nao depois de digitar tudo.
  const checarToken = useCallback(async () => {
    if (!token) {
      setChecado({ valido: false });
      setChecando(false);
      return;
    }

    try {
      const res = await fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      setChecado(res.ok && data.valido ? data : { valido: false });
    } catch {
      setChecado({ valido: false });
    } finally {
      setChecando(false);
    }
  }, [token]);

  useEffect(() => {
    checarToken();
  }, [checarToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (senha !== confirmacao) {
      toast.error('As senhas não conferem');
      return;
    }

    setSalvando(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: senha }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data?.error || 'Não foi possível definir a senha');
        // Link queimado ou expirado no meio do caminho: volta pro estado de erro.
        if (res.status === 400) setChecado({ valido: false });
        return;
      }

      toast.success('Senha definida com sucesso', { description: 'Faça login para continuar.' });
      router.push('/auth');
    } catch {
      toast.error('Erro ao definir a senha', { description: 'Tente de novo em alguns instantes.' });
    } finally {
      setSalvando(false);
    }
  };

  if (checando) {
    return (
      <AuthCard titulo="Verificando link..." mostrarVoltar={false}>
        <div className="flex justify-center py-6">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AuthCard>
    );
  }

  if (!checado.valido) {
    return (
      <AuthCard
        titulo="Link inválido ou expirado"
        descricao="Este link já foi usado ou passou da validade. Peça um novo para continuar."
      >
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <ShieldAlert className="w-5 h-5 text-destructive shrink-0" />
          <p className="text-sm text-muted-foreground">
            Por segurança, cada link só funciona uma vez e tem prazo para ser usado.
          </p>
        </div>

        <Button asChild className="w-full mt-4 h-12">
          <Link href="/auth/forgot-password">Pedir um novo link</Link>
        </Button>
      </AuthCard>
    );
  }

  const ehConvite = checado.tipo === 'invite';

  return (
    <AuthCard
      titulo={ehConvite ? 'Bem-vindo ao Maya' : 'Criar nova senha'}
      descricao={
        ehConvite
          ? `Defina a senha de acesso da conta ${checado.email}.`
          : `Escolha a nova senha da conta ${checado.email}.`
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="senha">Nova senha</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="senha"
              type={mostrarSenha ? 'text' : 'password'}
              required
              minLength={MIN_SENHA}
              autoComplete="new-password"
              autoFocus
              placeholder="Pelo menos 6 caracteres"
              className="pl-10 pr-10 h-12"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setMostrarSenha(!mostrarSenha)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {mostrarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmacao">Repita a senha</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="confirmacao"
              type={mostrarSenha ? 'text' : 'password'}
              required
              minLength={MIN_SENHA}
              autoComplete="new-password"
              className="pl-10 h-12"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
            />
          </div>
          {confirmacao.length > 0 && senha !== confirmacao && (
            <p className="text-xs text-destructive">As senhas não conferem.</p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full h-12"
          disabled={salvando || senha.length < MIN_SENHA || senha !== confirmacao}
        >
          {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {ehConvite ? 'Definir senha e entrar' : 'Salvar nova senha'}
        </Button>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  // `useSearchParams` exige fronteira de Suspense no App Router.
  return (
    <Suspense
      fallback={
        <AuthCard titulo="Carregando..." mostrarVoltar={false}>
          <div className="flex justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </AuthCard>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}

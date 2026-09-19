'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthCard } from '@/components/auth/AuthCard';
import { Loader2, Mail, MailCheck } from 'lucide-react';
import { toast } from 'sonner';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) throw new Error('Falha');

      // A API responde igual exista ou nao o e-mail, e a tela faz o mesmo: dizer
      // "esse e-mail nao esta cadastrado" entregaria quem tem conta aqui.
      setEnviado(true);
    } catch {
      toast.error('Nao foi possivel enviar o e-mail', {
        description: 'Tente de novo em alguns instantes.',
      });
    } finally {
      setLoading(false);
    }
  };

  if (enviado) {
    return (
      <AuthCard
        titulo="Verifique seu e-mail"
        descricao={`Se ${email} estiver cadastrado, o link para criar uma nova senha chega em instantes.`}
      >
        <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/40 p-4">
          <MailCheck className="w-5 h-5 text-brand-primary shrink-0" />
          <p className="text-sm text-muted-foreground">
            O link vale por 1 hora e só pode ser usado uma vez. Confira também a caixa de spam.
          </p>
        </div>

        <Button
          variant="outline"
          className="w-full mt-4"
          onClick={() => {
            setEnviado(false);
            setEmail('');
          }}
        >
          Usar outro e-mail
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      titulo="Esqueceu a senha?"
      descricao="Informe o e-mail da sua conta e enviaremos um link para você criar uma nova senha."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              placeholder="voce@restaurante.com.br"
              className="pl-10 h-12"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <Button type="submit" className="w-full h-12" disabled={loading || !email}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Enviar link
        </Button>
      </form>
    </AuthCard>
  );
}

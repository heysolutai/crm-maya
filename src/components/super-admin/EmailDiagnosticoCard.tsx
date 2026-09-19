'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Loader2, Mail, Send, XCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Diagnostico {
  configurado: boolean;
  host: string | null;
  port: number | null;
  secure: boolean | null;
  remetente: string | null;
  autenticado: boolean;
  conexao: { ok: boolean; motivo?: string };
}

/**
 * Estado do SMTP da plataforma e envio de teste.
 *
 * O SMTP vem do ambiente (SMTP_HOST e companhia), entao aqui nao se edita
 * nada: a tela existe pra responder "o envio de e-mail esta de pe?" sem
 * precisar cadastrar um usuario de verdade pra descobrir.
 */
export function EmailDiagnosticoCard() {
  const [diagnostico, setDiagnostico] = useState<Diagnostico | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [destino, setDestino] = useState('');
  const [enviando, setEnviando] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    try {
      const res = await fetch('/api/admin/email');
      if (!res.ok) throw new Error('Falha');
      setDiagnostico(await res.json());
    } catch {
      toast.error('Não foi possível consultar o status do e-mail');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const enviarTeste = async () => {
    setEnviando(true);
    try {
      const res = await fetch('/api/admin/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ para: destino }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error('O e-mail de teste não saiu', { description: data?.error });
        return;
      }

      toast.success('E-mail de teste enviado', { description: `Confira a caixa de ${destino}.` });
    } catch {
      toast.error('Erro ao enviar o e-mail de teste');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4" />
          Envio de e-mail (SMTP)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {carregando ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Consultando servidor...
          </div>
        ) : !diagnostico?.configurado ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">SMTP não configurado</p>
            <p>
              Preencha <code className="text-xs">SMTP_HOST</code>,{' '}
              <code className="text-xs">SMTP_PORT</code>, <code className="text-xs">SMTP_USER</code>,{' '}
              <code className="text-xs">SMTP_PASS</code> e <code className="text-xs">SMTP_FROM</code>{' '}
              no ambiente e reinicie o servidor. Sem isso, recuperação de senha, convite de usuário e
              relatório semanal não são enviados.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1 text-sm">
                <p className="font-medium">
                  {diagnostico.host}:{diagnostico.port}
                  {diagnostico.secure ? ' (TLS)' : ''}
                </p>
                <p className="text-muted-foreground text-xs">
                  Remetente: {diagnostico.remetente}
                  {diagnostico.autenticado ? ' · com autenticação' : ' · sem autenticação'}
                </p>
              </div>
              {diagnostico.conexao.ok ? (
                <Badge className="gap-1 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10">
                  <CheckCircle2 className="h-3 w-3" />
                  Conectado
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="h-3 w-3" />
                  Sem conexão
                </Badge>
              )}
            </div>

            {!diagnostico.conexao.ok && diagnostico.conexao.motivo && (
              <p className="text-xs text-destructive">{diagnostico.conexao.motivo}</p>
            )}

            <div className="space-y-2 pt-2">
              <Label htmlFor="email-teste">Enviar um e-mail de teste</Label>
              <div className="flex gap-2">
                <Input
                  id="email-teste"
                  type="email"
                  placeholder="voce@empresa.com.br"
                  value={destino}
                  onChange={(e) => setDestino(e.target.value)}
                />
                <Button onClick={enviarTeste} disabled={enviando || !destino}>
                  {enviando ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Enviar
                </Button>
              </div>
            </div>
          </>
        )}

        <Button variant="ghost" size="sm" onClick={carregar} disabled={carregando}>
          Atualizar status
        </Button>
      </CardContent>
    </Card>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Copy, Eye, KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api/client';

/** Endereco que o sistema de origem chama (mesmo dominio desta tela). */
export function useUrlEspelho(inboxId: string): string {
  const [url, setUrl] = useState('');
  useEffect(() => {
    setUrl(`${window.location.origin}/api/webhooks/espelho/${inboxId}`);
  }, [inboxId]);
  return url;
}

function CampoCopiavel({ id, label, valor }: { id: string; label: string; valor: string }) {
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(valor);
      toast.success(`${label} copiada`, { duration: 1500 });
    } catch {
      toast.error('Não foi possível copiar. Selecione e copie manualmente.');
    }
  };
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input id={id} value={valor} readOnly className="font-mono text-xs" onFocus={(e) => e.target.select()} />
        <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={copiar} title="Copiar">
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * URL + chave pra configurar no sistema de origem. A chave so existe aqui
 * (logo depois de criar ou de gerar nova): depois some de vez.
 */
export function EspelhoCredenciais({ inboxId, chave }: { inboxId: string; chave: string }) {
  const url = useUrlEspelho(inboxId);
  return (
    <div className="space-y-3">
      <CampoCopiavel id={`espelho-url-${inboxId}`} label="URL" valor={url} />
      <CampoCopiavel id={`espelho-chave-${inboxId}`} label="Chave secreta" valor={chave} />
      <p className="rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300">
        Copie a chave agora e salve direto no sistema de origem: ela não aparece de novo. Não mande por chat.
      </p>
      <p className="text-xs text-muted-foreground">
        Cada envio deve trazer o cabeçalho <span className="font-mono">X-Assinatura</span> com o HMAC-SHA256 (hex) do
        corpo, usando esta chave.
      </p>
    </div>
  );
}

interface Props {
  inboxId: string;
  companyId: string | null;
  isSuperAdmin: boolean;
}

/** Aba "Conexão" de uma conexão Espelho: o que é, a URL e "gerar nova chave". */
export function EspelhoConexaoCard({ inboxId, companyId, isSuperAdmin }: Props) {
  const url = useUrlEspelho(inboxId);
  const [confirmar, setConfirmar] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [novaChave, setNovaChave] = useState<string | null>(null);

  const gerar = async () => {
    setGerando(true);
    try {
      const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
      const res = await apiFetch(`/api/agents/${inboxId}/espelho-chave${qs}`, { method: 'POST' });
      const data = (await res.json()) as { chave?: string; error?: string };
      if (!res.ok || !data.chave) throw new Error(data.error || 'Não foi possível gerar a chave.');
      setNovaChave(data.chave);
      toast.success('Chave nova gerada. A anterior parou de valer.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível gerar a chave.');
    } finally {
      setGerando(false);
      setConfirmar(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
        <Eye className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="space-y-1 text-sm">
          <p className="font-medium">Somente leitura</p>
          <p className="text-muted-foreground">
            Outro sistema manda para cá uma cópia de cada mensagem, recebida ou enviada. O CRM só registra: a IA fica
            sempre desligada e não dá para responder por esta conexão.
          </p>
        </div>
      </div>

      {novaChave ? (
        <EspelhoCredenciais inboxId={inboxId} chave={novaChave} />
      ) : (
        <CampoCopiavel id={`espelho-url-${inboxId}`} label="URL" valor={url} />
      )}

      {isSuperAdmin && !novaChave && (
        <div className="space-y-1.5">
          <Button variant="outline" size="sm" onClick={() => setConfirmar(true)} disabled={gerando}>
            {gerando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
            Gerar nova chave
          </Button>
          <p className="text-xs text-muted-foreground">
            Use se a chave se perdeu ou vazou. A atual para de valer na hora: o sistema de origem precisa da nova.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={confirmar}
        onOpenChange={setConfirmar}
        title="Gerar uma chave nova?"
        description="A chave atual para de valer na hora. Até o sistema de origem receber a nova, as mensagens dele serão recusadas (e ele reenvia depois)."
        confirmLabel="Gerar nova chave"
        isLoading={gerando}
        onConfirm={gerar}
      />
    </div>
  );
}

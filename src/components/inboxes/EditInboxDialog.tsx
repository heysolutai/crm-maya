'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Eye, EyeOff, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import type { Inbox } from '@/hooks/useInboxes';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  inbox: Inbox | null;
  onSalvar: (dados: {
    id: string;
    displayName?: string;
    isActive?: boolean;
    phoneNumber?: string;
    apiUrl?: string;
    instanceApiKey?: string;
    adminToken?: string;
    restaurantId?: string;
  }) => void;
  salvando: boolean;
}

/**
 * Campo de segredo com prévia mascarada.
 *
 * Mostrar o campo vazio passaria a impressão de "não configurado", e a pessoa
 * preencheria de novo achando que faltava. Com a prévia ela vê que já existe e
 * só troca quando quiser — deixar como está não altera nada no servidor.
 */
function CampoSecreto({
  label,
  ajuda,
  mascarado,
  valor,
  onChange,
  onRevelar,
}: {
  label: string;
  ajuda?: string;
  mascarado: string | null;
  valor: string;
  onChange: (v: string) => void;
  onRevelar?: () => Promise<string | null>;
}) {
  const [alterando, setAlterando] = useState(false);
  const [revelado, setRevelado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const revelar = async () => {
    if (revelado) {
      setRevelado(null);
      return;
    }
    if (!onRevelar) return;
    setCarregando(true);
    try {
      setRevelado(await onRevelar());
    } finally {
      setCarregando(false);
    }
  };

  const copiar = async () => {
    const texto = revelado || (onRevelar ? await onRevelar() : null);
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

  if (!alterando) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}</Label>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded border bg-muted/50 px-2 py-1.5 font-mono text-xs">
            {revelado || mascarado || 'não configurado'}
          </code>
          {onRevelar && mascarado && (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={revelar} disabled={carregando}>
                {carregando ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : revelado ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copiar}>
                {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => setAlterando(true)}>
            Alterar
          </Button>
        </div>
        {ajuda && <p className="text-[11px] text-muted-foreground">{ajuda}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Input
          autoFocus
          className="font-mono text-xs"
          value={valor}
          placeholder="Cole o novo valor"
          onChange={(e) => onChange(e.target.value)}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onChange('');
            setAlterando(false);
          }}
        >
          Cancelar
        </Button>
      </div>
      {ajuda && <p className="text-[11px] text-muted-foreground">{ajuda}</p>}
    </div>
  );
}

export function EditInboxDialog({ open, onOpenChange, inbox, onSalvar, salvando }: Props) {
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [servidor, setServidor] = useState('');
  const [restaurante, setRestaurante] = useState('');
  const [novoToken, setNovoToken] = useState('');
  const [novoAdmin, setNovoAdmin] = useState('');
  const [ativo, setAtivo] = useState(true);

  useEffect(() => {
    if (!open || !inbox) return;
    setNome(inbox.display_name || '');
    setTelefone(inbox.phone_number || '');
    setServidor(inbox.api_url || '');
    setRestaurante((inbox.restaurant_id as string) || '');
    setNovoToken('');
    setNovoAdmin('');
    setAtivo(inbox.is_active);
  }, [open, inbox]);

  if (!inbox) return null;

  // Só o token da instância tem endpoint de revelação — o de admin não sai
  // do servidor de jeito nenhum.
  const revelarToken = async (): Promise<string | null> => {
    try {
      const res = await apiFetch(`/api/agents/${inbox.id}/api-key`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      return json.instance_api_key || null;
    } catch {
      toast.error('Não foi possível revelar a chave');
      return null;
    }
  };

  const salvar = () => {
    onSalvar({
      id: inbox.id,
      displayName: nome.trim() || undefined,
      phoneNumber: telefone.trim(),
      apiUrl: servidor.trim() || undefined,
      restaurantId: restaurante.trim(),
      // Vazio = não mexe no que está gravado.
      ...(novoToken.trim() ? { instanceApiKey: novoToken.trim() } : {}),
      ...(novoAdmin.trim() ? { adminToken: novoAdmin.trim() } : {}),
      isActive: ativo,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar caixa de entrada</DialogTitle>
          <DialogDescription>
            Trocar credencial não desconecta o número — os dados novos passam a valer no
            próximo envio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Telefone</Label>
              <Input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="5562999999999"
                className="font-mono text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">ID do restaurante</Label>
            <Input
              value={restaurante}
              onChange={(e) => setRestaurante(e.target.value)}
              placeholder="Identificador no sistema de reservas"
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              É por ele que as reservas criadas nesta caixa são vinculadas. Vazio desvincula.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Servidor</Label>
            <Input
              value={servidor}
              onChange={(e) => setServidor(e.target.value)}
              placeholder="https://sua-instancia.uazapi.com"
              className="font-mono text-xs"
            />
          </div>

          <CampoSecreto
            label="Chave da instância"
            ajuda="Token que autentica os envios deste número. Trocar aqui vale no próximo disparo."
            mascarado={inbox.instance_api_key}
            valor={novoToken}
            onChange={setNovoToken}
            onRevelar={revelarToken}
          />

          <CampoSecreto
            label="Token de administrador"
            ajuda="Token do servidor, usado para criar e remover instâncias. Não pode ser revelado."
            mascarado={inbox.admin_token ?? null}
            valor={novoAdmin}
            onChange={setNovoAdmin}
          />

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-sm">Ativa</Label>
              <p className="text-[11px] text-muted-foreground">
                Desativada, a caixa para de receber e enviar mensagens.
              </p>
            </div>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

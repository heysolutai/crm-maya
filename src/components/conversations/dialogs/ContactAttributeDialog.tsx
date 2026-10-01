import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

/** Limites espelham a validacao do servidor (/api/clients/attributes). */
const MAX_CHAVE = 40;
const MAX_VALOR = 500;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preenchido = edicao; vazio = novo atributo. */
  atributo?: { chave: string; valor: string } | null;
  /** Chaves ja usadas, pra impedir duplicata. */
  chavesExistentes: string[];
  onSalvar: (chave: string, valor: string, chaveAnterior?: string) => Promise<boolean>;
}

export function ContactAttributeDialog({
  open,
  onOpenChange,
  atributo,
  chavesExistentes,
  onSalvar,
}: Props) {
  const [chave, setChave] = useState('');
  const [valor, setValor] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) {
      setChave(atributo?.chave || '');
      setValor(atributo?.valor || '');
    }
  }, [open, atributo]);

  const chaveLimpa = chave.trim();
  const duplicada =
    !!chaveLimpa &&
    chaveLimpa !== atributo?.chave &&
    chavesExistentes.some((k) => k.toLowerCase() === chaveLimpa.toLowerCase());
  const podeSalvar = !!chaveLimpa && !!valor.trim() && !duplicada && !salvando;

  const salvar = async () => {
    if (!podeSalvar) return;
    setSalvando(true);
    try {
      const ok = await onSalvar(chaveLimpa, valor.trim(), atributo?.chave);
      if (ok) onOpenChange(false);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{atributo ? 'Editar atributo' : 'Novo atributo'}</DialogTitle>
          <DialogDescription>
            Informação livre sobre o contato — vale para todas as conversas dele.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="atributo-chave">Nome</Label>
            <Input
              id="atributo-chave"
              value={chave}
              maxLength={MAX_CHAVE}
              placeholder="Ex: CPF, Placa do veículo, Plano"
              onChange={(e) => setChave(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && salvar()}
            />
            {duplicada && (
              <p className="text-[11px] text-destructive">Já existe um atributo com esse nome.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="atributo-valor">Valor</Label>
            <Input
              id="atributo-valor"
              value={valor}
              maxLength={MAX_VALOR}
              placeholder="Ex: 123.456.789-00"
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && salvar()}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={!podeSalvar}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

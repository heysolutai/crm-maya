'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAcoesSolicitacao, useRegrasEncaminhamento } from '@/hooks/useSolicitacoes';
import { FUNIS, type Funil } from '@/lib/solicitacoes/funis';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  funil: Funil;
}

/** (41) 99867-9696 enquanto digita. */
function mascara(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  const corte = d.length === 11 ? 7 : 6;
  return `(${d.slice(0, 2)}) ${d.slice(2, corte)}-${d.slice(corte)}`;
}

/** A equipe registra um pedido que chegou por fora da IA (telefone, Instagram, balcão). */
export function NovaSolicitacaoDialog({ open, onOpenChange, funil }: Props) {
  const { criar } = useAcoesSolicitacao();
  const { lista } = useRegrasEncaminhamento();
  const categorias = (lista.data ?? []).filter((r) => r.funnel === funil && !r.isSystem && r.isActive);
  const [ruleId, setRuleId] = useState('');
  const [nome, setNome] = useState('');
  const [tel, setTel] = useState('');
  const [resumo, setResumo] = useState('');
  const [valor, setValor] = useState('');

  useEffect(() => {
    if (!open) return;
    setNome('');
    setTel('');
    setResumo('');
    setValor('');
    setRuleId('');
  }, [open]);

  const categoria = ruleId || categorias[0]?.id || '';
  const valorNumero = valor.trim() ? Number(valor.replace(/\./g, '').replace(',', '.')) : null;

  const enviar = async () => {
    try {
      await criar.mutateAsync({
        funil,
        ...(categoria ? { ruleId: categoria } : {}),
        nome,
        telefone: tel || undefined,
        resumo: resumo || undefined,
        valor: funil === 'eventos' && valorNumero != null && Number.isFinite(valorNumero) ? valorNumero : null,
      });
      toast.success('Solicitação criada.');
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !criar.isPending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Nova solicitação</DialogTitle>
          <DialogDescription>{FUNIS[funil].label}: para pedidos que chegaram por telefone, Instagram ou no balcão.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {categorias.length > 1 && (
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={categoria} onValueChange={setRuleId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categorias.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="nova-nome">Nome do cliente</Label>
              <Input id="nova-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nova-tel">WhatsApp</Label>
              <Input
                id="nova-tel"
                value={tel}
                onChange={(e) => setTel(mascara(e.target.value))}
                placeholder="(41) 99867-9696"
                inputMode="tel"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nova-resumo">Resumo do pedido</Label>
            <Textarea
              id="nova-resumo"
              value={resumo}
              onChange={(e) => setResumo(e.target.value)}
              placeholder={funil === 'eventos' ? 'Ex.: Casamento para 120 pessoas em março, quer cardápio fechado.' : 'Ex.: Pediu nota fiscal da visita de sábado.'}
              rows={3}
              maxLength={2000}
            />
          </div>
          {funil === 'eventos' && (
            <div className="space-y-1.5">
              <Label htmlFor="nova-valor">Valor estimado (R$)</Label>
              <Input
                id="nova-valor"
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ''))}
                placeholder="Opcional"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={criar.isPending}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={criar.isPending || !nome.trim()}>
            {criar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

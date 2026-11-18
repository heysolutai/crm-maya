'use client';

import { useState } from 'react';
import { BookPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAcoesSolicitacao } from '@/hooks/useSolicitacoes';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  solicitacaoId: string;
  /** Pergunta sugerida (o resumo da IA). */
  pergunta: string;
}

/** A dúvida que a IA não soube vira pergunta e resposta da base: na próxima, a IA responde sozinha. */
export function ConhecimentoDialog({ open, onOpenChange, solicitacaoId, pergunta: sugerida }: Props) {
  const { adicionarConhecimento } = useAcoesSolicitacao();
  const [pergunta, setPergunta] = useState(sugerida);
  const [resposta, setResposta] = useState('');
  const [resolver, setResolver] = useState(true);

  const enviar = async () => {
    try {
      const r = await adicionarConhecimento.mutateAsync({ id: solicitacaoId, pergunta, resposta, resolver });
      toast.success(
        r.indexada
          ? 'Pronto! A IA já sabe responder essa pergunta.'
          : 'Pergunta salva na base. A IA passa a usar assim que a base for sincronizada.'
      );
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !adicionarConhecimento.isPending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookPlus className="h-5 w-5 text-primary" />
            Ensinar a IA
          </DialogTitle>
          <DialogDescription>A pergunta e a resposta entram na base de conhecimento. Na próxima vez, a IA responde sozinha.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="conhecimento-pergunta">Pergunta do cliente</Label>
            <Input id="conhecimento-pergunta" value={pergunta} onChange={(e) => setPergunta(e.target.value)} maxLength={500} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="conhecimento-resposta">Resposta</Label>
            <Textarea
              id="conhecimento-resposta"
              value={resposta}
              onChange={(e) => setResposta(e.target.value)}
              placeholder="Ex.: Sim! Aceitamos vale-refeição Sodexo, Alelo e VR."
              rows={4}
              maxLength={4000}
              autoFocus
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={resolver} onCheckedChange={(v) => setResolver(v === true)} />
            Marcar esta solicitação como resolvida
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={adicionarConhecimento.isPending}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={adicionarConhecimento.isPending || pergunta.trim().length < 3 || resposta.trim().length < 2}>
            {adicionarConhecimento.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar na base
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hand, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';
import { apiFetch } from '@/lib/api/client';
import { cn } from '@/lib/utils';

const MAXIMO = 1440;

interface Props {
  canEdit: boolean;
}

/**
 * "Quando um atendente responder": por quantos minutos a IA fica pausada para
 * o cliente depois que alguém da equipe responde (settings.ai_pause_minutes).
 *
 * Lê o valor em vigor de GET /api/conversations/ai-pause, com a mesma chave
 * que a tela de conversas usa (['ai-pause-default', companyId]), e salva com
 * PATCH /api/company-settings no mesmo formato da tela de Configurações.
 */
export function AiPauseCard({ canEdit }: Props) {
  const queryClient = useQueryClient();
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const chave = ['ai-pause-default', companyId] as const;

  const { data: salvo, isLoading, isFetching, refetch } = useQuery({
    queryKey: chave,
    queryFn: async (): Promise<number | null> => {
      const res = await apiFetch('/api/conversations/ai-pause');
      if (!res.ok) return null;
      const json: { defaultMinutes?: unknown } = await res.json();
      return typeof json.defaultMinutes === 'number' ? json.defaultMinutes : null;
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });

  const [valor, setValor] = useState('');

  // O valor salvo chega depois do primeiro render (ou muda em outra tela).
  useEffect(() => {
    if (typeof salvo === 'number') setValor(String(salvo));
  }, [salvo]);

  const numero = Number(valor);
  const valido = valor.trim() !== '' && Number.isInteger(numero) && numero >= 0 && numero <= MAXIMO;

  const salvar = useMutation({
    mutationFn: async (minutos: number) => {
      const res = await apiFetch('/api/company-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, settings: { ai_pause_minutes: minutos } }),
      });
      if (!res.ok) {
        throw new Error(
          res.status === 403
            ? 'Só o administrador do restaurante pode alterar isso.'
            : 'Não foi possível salvar. Tente de novo.'
        );
      }
      return minutos;
    },
    onSuccess: (minutos) => {
      queryClient.setQueryData(chave, minutos);
      queryClient.invalidateQueries({ queryKey: ['ai-pause-default'] });
      queryClient.invalidateQueries({ queryKey: ['company'] });
      toast.success(
        minutos === 0
          ? 'Salvo: a IA só volta quando alguém clicar em Retomar IA.'
          : `Salvo: a IA para por ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar. Tente de novo.');
    },
  });

  const enviar = () => {
    if (!canEdit || !valido || !companyId || salvar.isPending) return;
    salvar.mutate(numero);
  };

  const semValor = !isLoading && typeof salvo !== 'number';
  const inputId = 'ai-pause-minutes';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Hand className="h-5 w-5 text-primary" />
          Quando um atendente responder
        </CardTitle>
        <CardDescription>
          Assim o cliente não recebe resposta da IA e do atendente ao mesmo tempo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-10 w-full max-w-md" />
        ) : semValor ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">Não foi possível carregar o tempo atual.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar de novo
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
              <Label htmlFor={inputId} className="font-normal leading-snug">
                A IA para de responder esse cliente por
              </Label>
              <Input
                id={inputId}
                type="number"
                inputMode="numeric"
                min={0}
                max={MAXIMO}
                step={1}
                value={valor}
                disabled={!canEdit}
                onChange={(e) => setValor(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') enviar();
                }}
                className="w-24"
                aria-invalid={!valido}
                aria-describedby={`${inputId}-ajuda`}
              />
              <span>minutos</span>
            </div>

            <p
              id={`${inputId}-ajuda`}
              className={cn('text-xs', valido ? 'text-muted-foreground' : 'text-destructive')}
            >
              {valido
                ? '0 = a IA só volta quando alguém clicar em "Retomar IA" na conversa.'
                : `Use um número inteiro de 0 a ${MAXIMO} (24 horas).`}
            </p>

            {canEdit && (
              <Button onClick={enviar} disabled={!valido || salvar.isPending || numero === salvo || !companyId}>
                {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

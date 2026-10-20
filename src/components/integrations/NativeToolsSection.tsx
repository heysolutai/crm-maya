'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useEvents } from '@/hooks/useEvents';
import { AbilityRow, AmberHint } from './AbilityRow';
import type { NativeToolState } from './types';
import { useSaveNativeTools } from './useIntegrations';

interface Props {
  native: NativeToolState[];
  canEdit: boolean;
}

/** Habilidades que falam dos eventos do restaurante. */
const EVENT_TOOLS = ['consultar_eventos', 'registrar_inscricao_evento'];

/**
 * "O que a IA pode fazer": uma linha por habilidade, cada chave salva na hora.
 */
export function NativeToolsSection({ native, canEdit }: Props) {
  const saveNative = useSaveNativeTools();
  const { data: events, isSuccess: eventosCarregados } = useEvents();
  const semEventos = eventosCarregados && (events?.length ?? 0) === 0;

  const alternar = (tool: NativeToolState, ligar: boolean) => {
    const proxima = native
      .filter((t) => (t.name === tool.name ? ligar : t.enabled))
      .map((t) => t.name);
    saveNative.mutate(proxima, {
      onSuccess: () => toast.success('Salvo', { duration: 1500 }),
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : 'Não foi possível salvar. Tente de novo.');
      },
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-5 w-5 text-primary" />O que a IA pode fazer
        </CardTitle>
        <CardDescription>Ligue o que a IA pode fazer sozinha. Cada mudança é salva na hora.</CardDescription>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {native.map((tool) => {
          const ehEvento = EVENT_TOOLS.includes(tool.name);
          return (
            <AbilityRow
              key={tool.name}
              id={`native-${tool.name}`}
              label={tool.label}
              help={tool.help}
              checked={tool.enabled}
              disabled={!canEdit}
              onChange={(v) => alternar(tool, v)}
            >
              {ehEvento && tool.enabled && semEventos && (
                <AmberHint>
                  Você ainda não cadastrou nenhum evento.{' '}
                  <Link href="/app/events" className="font-medium underline">
                    Cadastrar um evento
                  </Link>
                </AmberHint>
              )}
              {ehEvento && (
                <Link href="/app/events" className="inline-block text-sm text-primary hover:underline">
                  Cadastrar eventos →
                </Link>
              )}
            </AbilityRow>
          );
        })}
      </CardContent>
    </Card>
  );
}

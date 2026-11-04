'use client';

import Link from 'next/link';
import { toast } from 'sonner';
import { useEvents } from '@/hooks/useEvents';
import { AbilityRow, AmberHint } from './AbilityRow';
import type { NativeToolState } from './types';
import { useSaveNativeTools } from './useIntegrations';

interface Props {
  /** Todas as habilidades nativas: a lista inteira vai junto ao salvar. */
  native: NativeToolState[];
  /** As que aparecem aqui. */
  tools: NativeToolState[];
  canEdit: boolean;
}

/** Habilidades que falam dos eventos do restaurante. */
const EVENT_TOOLS = ['consultar_eventos', 'registrar_inscricao_evento'];

/** Uma linha por habilidade, cada chave salva na hora. */
export function NativeToolsSection({ native, tools, canEdit }: Props) {
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
    <div className="divide-y">
      {tools.map((tool) => {
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
            {tool.enabled && EVENT_TOOLS.includes(tool.name) && semEventos && (
              <AmberHint>
                Você ainda não cadastrou nenhum evento.{' '}
                <Link href="/app/events" className="font-medium underline">
                  Cadastrar um evento
                </Link>
              </AmberHint>
            )}
            {tool.name === 'transferir_para_humano' && !tool.enabled && (
              <AmberHint>Recomendado deixar ligado.</AmberHint>
            )}
          </AbilityRow>
        );
      })}
    </div>
  );
}

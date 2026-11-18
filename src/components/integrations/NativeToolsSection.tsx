'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
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

/** Encaminhamentos: as regras (quando, o que responder, quem avisar) ficam no CRM. */
const REGRAS_DO_CRM: Record<string, 'atendimento' | 'eventos'> = {
  transferir_para_humano: 'atendimento',
  encaminhar_para_eventos: 'eventos',
};

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
            {REGRAS_DO_CRM[tool.name] && (
              <Link
                href={`/app/crm?funil=${REGRAS_DO_CRM[tool.name]}&regras=1`}
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Ver regras e avisos
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </AbilityRow>
        );
      })}
    </div>
  );
}

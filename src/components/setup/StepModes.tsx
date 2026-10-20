"use client";

import { forwardRef, useImperativeHandle } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { Bot, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { sendJson, type SetupStepHandle } from './setup-api';
import type { ChecklistModes, SetupStatus } from './setup-status';

interface Props {
  companyId: string;
  status: SetupStatus | null;
  value: ChecklistModes;
  onChange: (value: ChecklistModes) => void;
}

const MODES: Array<{
  key: keyof ChecklistModes;
  title: string;
  description: string;
  bullets: string[];
  icon: typeof Bot;
}> = [
  {
    key: 'atendimento',
    title: 'IA Atendimento',
    description: 'Responde os clientes no WhatsApp.',
    bullets: ['Reservas', 'Dúvidas', 'Cardápio e preços'],
    icon: Bot,
  },
  {
    key: 'avaliacao',
    title: 'IA Avaliação',
    description: 'Pesquisa pós-visita com os clientes atendidos.',
    bullets: ['Coleta a nota e o comentário', 'Convida para avaliar no Google / TripAdvisor', 'Resumo semanal por e-mail'],
    icon: Star,
  },
];

/**
 * Passo "Modos da IA". Nao existe coluna de modo: cada modo mapeia pra
 * configuracao que ja existe.
 *  - IA Avaliacao = ReviewSettings.enabled (PATCH /api/admin/review-module)
 *  - IA Atendimento = agente de IA configurado. A escolha fica guardada em
 *    settings.setup_modes so pra o wizard lembrar quais passos mostrar.
 */
export const StepModes = forwardRef<SetupStepHandle, Props>(function StepModes(
  { companyId, status, value, onChange },
  ref
) {
  const queryClient = useQueryClient();

  useImperativeHandle(
    ref,
    () => ({
      save: async () => {
        try {
          const reviewEnabled = status?.review?.enabled ?? false;
          if (value.avaliacao !== reviewEnabled) {
            await sendJson(
              '/api/admin/review-module',
              'PATCH',
              { companyId, enabled: value.avaliacao },
              'Erro ao atualizar o módulo de avaliação'
            );
          }
          if (status?.company.atendimentoMode !== value.atendimento) {
            await sendJson(
              '/api/company-settings',
              'PATCH',
              { companyId, settings: { setup_modes: { atendimento: value.atendimento } } },
              'Erro ao salvar os modos da IA'
            );
          }
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['setup-checklist', companyId] }),
            queryClient.invalidateQueries({ queryKey: ['review-module-status'] }),
            queryClient.invalidateQueries({ queryKey: ['company', companyId] }),
          ]);
          toast.success('Modos da IA salvos');
          return true;
        } catch (e) {
          toast.error((e as Error).message);
          return false;
        }
      },
    }),
    [companyId, status, value, queryClient]
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {MODES.map((mode) => {
          const Icon = mode.icon;
          const checked = value[mode.key];
          return (
            <label
              key={mode.key}
              className={cn(
                'flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors',
                checked ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border/60 hover:border-primary/40'
              )}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(v) => onChange({ ...value, [mode.key]: v === true })}
                className="mt-0.5"
              />
              <div className="space-y-1.5">
                <p className="flex items-center gap-2 font-semibold">
                  <Icon className="h-4 w-4 text-primary" />
                  {mode.title}
                </p>
                <p className="text-sm text-muted-foreground">{mode.description}</p>
                <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-0.5">
                  {mode.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            </label>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        IA Avaliação liga ou desliga o módulo de avaliações do restaurante (a coleta diária e o
        menu &quot;Avaliações&quot;). Desmarcar IA Atendimento só tira os passos de configuração do
        agente deste setup: não desliga um agente que já esteja respondendo.
      </p>
    </div>
  );
});

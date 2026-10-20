"use client";

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, CheckCircle2, ChevronRight, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { ApiKeysTab } from '@/components/super-admin/company-details/ApiKeysTab';
import { cn } from '@/lib/utils';
import type { ChecklistGroup, ChecklistItem, ChecklistModes, SetupStatus } from './setup-status';

/** Passos do wizard pra onde cada grupo do checklist manda corrigir. */
export type SetupStepKey = 'restaurante' | 'canal' | 'modos' | 'atendimento' | 'avaliacao' | 'revisao';

interface Props {
  companyId: string;
  status: SetupStatus | null;
  items: ChecklistItem[];
  modes: ChecklistModes;
  isFetching: boolean;
  onRefresh: () => void;
  onGoTo: (step: SetupStepKey) => void;
}

// `integracao` nao tem passo: a API key e criada logo abaixo do checklist e o
// webhook de avaliacoes e global (Configuracoes do sistema).
const GROUPS: Array<{ key: ChecklistGroup; title: string; step?: SetupStepKey }> = [
  { key: 'canal', title: 'Canal WhatsApp', step: 'canal' },
  { key: 'atendimento', title: 'IA Atendimento', step: 'atendimento' },
  { key: 'avaliacao', title: 'IA Avaliação', step: 'avaliacao' },
  { key: 'integracao', title: 'Integração (n8n)' },
];

function StatusIcon({ status }: { status: ChecklistItem['status'] }) {
  if (status === 'green') return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />;
  if (status === 'yellow') return <AlertCircle className="h-4 w-4 shrink-0 text-yellow-500" />;
  return <XCircle className="h-4 w-4 shrink-0 text-red-500" />;
}

/**
 * Passo "Revisao": checklist calculado dos dados reais (GET /api/setup-checklist).
 * Vermelho = obrigatorio pra ir ao ar; amarelo = recomendado.
 */
export function StepSummary({ companyId, status, items, modes, isFetching, onRefresh, onGoTo }: Props) {
  const required = items.filter((i) => i.category === 'red');
  const requiredDone = required.filter((i) => i.status === 'green').length;
  const percent = required.length > 0 ? Math.round((requiredDone / required.length) * 100) : 0;
  const needsApiKey = !!status && status.activeApiKeys === 0;

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">
            Obrigatórios: {requiredDone}/{required.length}
          </p>
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Atualizar
          </Button>
        </div>
        <Progress value={percent} className="h-2" />
        {!modes.atendimento && !modes.avaliacao && (
          <p className="text-xs text-muted-foreground">
            Nenhum modo de IA selecionado: só o canal está sendo conferido.
          </p>
        )}
      </div>

      {GROUPS.map((group) => {
        const groupItems = items.filter((i) => i.group === group.key);
        if (groupItems.length === 0) return null;
        const pending = groupItems.some((i) => i.status !== 'green');
        return (
          <Card key={group.key}>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
              <CardTitle className="text-base">{group.title}</CardTitle>
              {pending && group.step && (
                <Button variant="outline" size="sm" onClick={() => onGoTo(group.step as SetupStepKey)}>
                  Corrigir
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
              {group.key === 'integracao' && modes.avaliacao && status && !status.reviewWebhookConfigured && (
                <Button variant="outline" size="sm" asChild>
                  <Link href="/super-admin/system-settings">
                    Configurações do sistema
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-1.5">
              {groupItems.map((item) => (
                <div key={item.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                  <StatusIcon status={item.status} />
                  <div className="min-w-0 flex-1">
                    <p className={cn(item.status === 'green' ? 'text-muted-foreground' : 'font-medium')}>
                      {item.label}
                      {item.category === 'yellow' && item.status !== 'green' && (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">(recomendado)</span>
                      )}
                    </p>
                    {item.hint && <p className="truncate text-xs text-muted-foreground">{item.hint}</p>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      {needsApiKey && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Criar API key do sistema</CardTitle>
            <CardDescription>
              O n8n usa essa chave para responder pela IA e para disparar as avaliações. Depois de criar,
              clique em &quot;Atualizar&quot;.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ApiKeysTab companyId={companyId} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

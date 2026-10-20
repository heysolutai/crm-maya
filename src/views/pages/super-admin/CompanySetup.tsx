"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Loader2,
  Smartphone,
  Sparkles,
  Star,
  type LucideIcon,
} from 'lucide-react';
import { useCompanyDetails } from '@/hooks/useCompanyDetails';
import { useSetupChecklist } from '@/hooks/useSetupChecklist';
import { cn } from '@/lib/utils';
import { StepRestaurant, type SetupCompany } from '@/components/setup/StepRestaurant';
import { StepChannel } from '@/components/setup/StepChannel';
import { StepModes } from '@/components/setup/StepModes';
import { StepAttendance } from '@/components/setup/StepAttendance';
import { StepReviews } from '@/components/setup/StepReviews';
import { StepSummary, type SetupStepKey } from '@/components/setup/StepSummary';
import { sendJson, type SetupStepHandle } from '@/components/setup/setup-api';
import type { ChecklistModes } from '@/components/setup/setup-status';

const STEP_META: Record<SetupStepKey, { label: string; title: string; description: string; icon: LucideIcon }> = {
  restaurante: {
    label: 'Restaurante',
    title: 'Dados do restaurante',
    description: 'Informações básicas do restaurante.',
    icon: Building2,
  },
  canal: {
    label: 'Canal WhatsApp',
    title: 'Canal WhatsApp',
    description: 'Conecte o número do restaurante e informe o ID dele na Reserve Maya.',
    icon: Smartphone,
  },
  modos: {
    label: 'Modos da IA',
    title: 'Modos da IA',
    description: 'Escolha o que a IA vai fazer neste restaurante.',
    icon: Sparkles,
  },
  atendimento: {
    label: 'IA Atendimento',
    title: 'IA Atendimento',
    description: 'O mínimo para a IA responder os clientes: agente, webhook, prompt e FAQ.',
    icon: Bot,
  },
  avaliacao: {
    label: 'IA Avaliação',
    title: 'IA Avaliação',
    description: 'Pesquisa pós-visita e convite para avaliar no Google / TripAdvisor.',
    icon: Star,
  },
  revisao: {
    label: 'Revisão',
    title: 'Revisão',
    description: 'Confira o que está pronto antes de concluir. Tudo calculado dos dados reais.',
    icon: ClipboardCheck,
  },
};

/**
 * Setup de um restaurante novo pelo super-admin, num lugar so:
 * Restaurante -> Canal WhatsApp -> Modos da IA -> IA Atendimento -> IA Avaliacao -> Revisao.
 *
 * Cada passo grava no "Salvar e continuar" (via SetupStepHandle); "Pular" so
 * avanca. Os passos de IA so aparecem quando o modo correspondente esta marcado.
 * "Concluir setup" grava settings.setup_completed = true.
 */
export default function CompanySetup() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const queryClient = useQueryClient();
  const { company: rawCompany, isLoading, error } = useCompanyDetails(id);
  const company = (rawCompany ?? null) as SetupCompany | null;

  const [modes, setModes] = useState<ChecklistModes>({ atendimento: true, avaliacao: false });
  const { items, status, isFetching, refetch } = useSetupChecklist(id, modes);

  // Modos iniciais vem do estado salvo (uma vez so: depois e o usuario quem manda).
  const modesInitRef = useRef(false);
  useEffect(() => {
    if (modesInitRef.current || !status) return;
    modesInitRef.current = true;
    setModes({
      atendimento: status.company.atendimentoMode ?? true,
      avaliacao: status.review?.enabled ?? false,
    });
  }, [status]);

  const steps = useMemo<SetupStepKey[]>(
    () => [
      'restaurante',
      'canal',
      'modos',
      ...(modes.atendimento ? (['atendimento'] as const) : []),
      ...(modes.avaliacao ? (['avaliacao'] as const) : []),
      'revisao',
    ],
    [modes]
  );

  const [current, setCurrent] = useState<SetupStepKey>('restaurante');
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const stepRef = useRef<SetupStepHandle>(null);

  const currentIndex = Math.max(0, steps.indexOf(current));
  const currentKey = steps[currentIndex];
  const isLast = currentIndex === steps.length - 1;
  const meta = STEP_META[currentKey];

  const pendingRequired = items.filter((i) => i.category === 'red' && i.status !== 'green');

  const goTo = (key: SetupStepKey) => {
    setCurrent(key);
    void refetch();
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goNext = () => {
    const next = steps[currentIndex + 1];
    if (next) goTo(next);
  };

  const goBack = () => {
    const prev = steps[currentIndex - 1];
    if (prev) goTo(prev);
  };

  const handleSaveAndContinue = async () => {
    setSaving(true);
    try {
      const ok = stepRef.current ? await stepRef.current.save() : true;
      if (ok) goNext();
    } finally {
      setSaving(false);
    }
  };

  const completeSetup = async () => {
    setSaving(true);
    try {
      await sendJson(
        '/api/company-settings',
        'PATCH',
        { companyId: id, settings: { setup_completed: true } },
        'Erro ao concluir o setup'
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['company', id] }),
        queryClient.invalidateQueries({ queryKey: ['companies'] }),
        queryClient.invalidateQueries({ queryKey: ['setup-checklist', id] }),
      ]);
      toast.success('Setup concluído');
      router.push(`/super-admin/companies/${id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = () => {
    if (pendingRequired.length > 0) {
      setConfirmOpen(true);
      return;
    }
    void completeSetup();
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-2xl font-bold">Restaurante não encontrado</h2>
          <Button onClick={() => router.push('/super-admin/companies')}>Voltar</Button>
        </div>
      </div>
    );
  }

  const displayName = company.tradeName || company.trade_name || company.name;

  const renderStep = () => {
    switch (currentKey) {
      case 'restaurante':
        return (
          <Card>
            <CardContent className="pt-6">
              <StepRestaurant key="restaurante" ref={stepRef} company={company} />
            </CardContent>
          </Card>
        );
      case 'canal':
        return (
          <StepChannel
            key="canal"
            ref={stepRef}
            companyId={id}
            companyName={displayName}
            status={status}
            isFetching={isFetching}
            onRefresh={() => void refetch()}
          />
        );
      case 'modos':
        return (
          <Card>
            <CardContent className="pt-6">
              <StepModes key="modos" ref={stepRef} companyId={id} status={status} value={modes} onChange={setModes} />
            </CardContent>
          </Card>
        );
      case 'atendimento':
        return (
          <StepAttendance
            key="atendimento"
            ref={stepRef}
            companyId={id}
            companyName={displayName}
            status={status}
            onRefresh={() => void refetch()}
          />
        );
      case 'avaliacao':
        return <StepReviews key="avaliacao" ref={stepRef} companyId={id} companyName={displayName} status={status} />;
      case 'revisao':
        return (
          <StepSummary
            companyId={id}
            status={status}
            items={items}
            modes={modes}
            isFetching={isFetching}
            onRefresh={() => void refetch()}
            onGoTo={goTo}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Cabecalho */}
      <div className="space-y-2">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href={`/super-admin/companies/${id}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao restaurante
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Building2 className="h-6 w-6" />
            Setup: {displayName}
          </h1>
          {status?.company.setupCompleted && <Badge variant="secondary">Setup concluído</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          Passo {currentIndex + 1} de {steps.length}: configure o restaurante sem sair desta tela.
        </p>
      </div>

      {/* Stepper */}
      <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Passos do setup">
        {steps.map((key, index) => {
          const Icon = STEP_META[key].icon;
          const isCurrent = index === currentIndex;
          const isDone = index < currentIndex;
          return (
            <div key={key} className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={() => goTo(key)}
                disabled={saving}
                aria-current={isCurrent ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                  isCurrent
                    ? 'bg-primary text-primary-foreground'
                    : isDone
                      ? 'bg-primary/10 text-primary hover:bg-primary/15'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                {isDone ? <Check className="h-4 w-4 shrink-0" /> : <Icon className="h-4 w-4 shrink-0" />}
                <span className={cn(isCurrent ? 'inline' : 'hidden md:inline')}>{STEP_META[key].label}</span>
              </button>
              {index < steps.length - 1 && <ChevronRight className="mx-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
            </div>
          );
        })}
      </nav>

      {/* Titulo do passo */}
      <div>
        <h2 className="text-lg font-semibold">{meta.title}</h2>
        <p className="text-sm text-muted-foreground">{meta.description}</p>
      </div>

      {renderStep()}

      {/* Rodape */}
      <div className="sticky bottom-0 z-10 rounded-lg border bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" onClick={goBack} disabled={currentIndex === 0 || saving}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            Voltar
          </Button>
          <div className="flex gap-2">
            {!isLast && (
              <Button variant="ghost" onClick={goNext} disabled={saving}>
                Pular
              </Button>
            )}
            {isLast ? (
              <Button onClick={handleFinish} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Concluir setup
              </Button>
            ) : (
              <Button onClick={handleSaveAndContinue} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar e continuar
                {!saving && <ChevronRight className="ml-1 h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Concluir com pendências?"
        description={`Ainda há ${pendingRequired.length} item(ns) obrigatório(s) pendente(s): ${pendingRequired
          .map((i) => i.label)
          .join(', ')}. O restaurante pode não funcionar completo até resolver.`}
        confirmLabel="Concluir mesmo assim"
        onConfirm={completeSetup}
      />
    </div>
  );
}

"use client";

import { useRouter } from 'next/navigation';
import { useOnboarding, OnboardingStatus } from '@/hooks/useOnboarding';
import { Button } from '@/components/ui/button';
import { CheckCircle2, MessageSquare, Bot, BookOpen, ArrowRight, PartyPopper } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  key: keyof OnboardingStatus;
  icon: React.ElementType;
  title: string;
  desc: string;
  href: string;
  cta: string;
}

// A API key é criada automaticamente na criação da empresa — por isso não vira
// passo aqui. O dono só precisa destes 3 pra IA começar a atender.
const STEPS: Step[] = [
  {
    key: 'whatsappConnected',
    icon: MessageSquare,
    title: 'Conecte o WhatsApp',
    desc: 'Conecte o número do seu restaurante (API Reservemaya) e a IA já começa a atender.',
    href: '/app/inboxes',
    cta: 'Conectar',
  },
  {
    key: 'agentConfigured',
    icon: Bot,
    title: 'Configure o agente de IA',
    desc: 'Defina como a IA fala com seus clientes — tom, horário e o que ela pode fazer.',
    href: '/app/inboxes',
    cta: 'Configurar',
  },
  {
    key: 'knowledgeAdded',
    icon: BookOpen,
    title: 'Adicione o conhecimento',
    desc: 'Suba um PDF de perguntas e respostas, ou preencha as FAQs aqui mesmo no CRM.',
    href: '/app/inboxes',
    cta: 'Adicionar',
  },
];

export function OnboardingChecklist() {
  const router = useRouter();
  const { data, isLoading } = useOnboarding();

  if (isLoading || !data) return null;

  const done = STEPS.filter((s) => data[s.key]).length;
  const total = STEPS.length;
  if (done === total) return null; // tudo pronto → a checklist some sozinha

  const pct = Math.round((done / total) * 100);

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] to-transparent p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[17px] font-bold tracking-tight flex items-center gap-2">
          <PartyPopper className="h-5 w-5 text-primary" />
          Primeiros passos
        </h2>
        <span className="text-sm font-semibold text-primary">{done}/{total}</span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Configure seu restaurante em 3 passos pra IA começar a atender seus clientes.
      </p>

      <div className="h-1.5 w-full rounded-full bg-primary/10 mb-4 overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="space-y-2">
        {STEPS.map((step) => {
          const isDone = data[step.key];
          const Icon = step.icon;
          return (
            <div
              key={step.key}
              className={cn(
                'flex items-center gap-3 rounded-xl border p-3 transition-colors',
                isDone ? 'border-emerald-500/20 bg-emerald-500/[0.04]' : 'border-border/60 bg-card'
              )}
            >
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  isDone ? 'bg-emerald-500/15' : 'bg-primary/10'
                )}
              >
                {isDone ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <Icon className="h-4 w-4 text-primary" />
                )}
              </span>
              <div className="flex-1 min-w-0">
                <p className={cn('font-medium text-sm', isDone && 'text-muted-foreground line-through')}>
                  {step.title}
                </p>
                {!isDone && <p className="text-xs text-muted-foreground">{step.desc}</p>}
              </div>
              {!isDone && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => router.push(step.href)}
                >
                  {step.cta}
                  <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

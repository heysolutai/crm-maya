"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Bot, Clock, Link2, Mail, MessageSquare } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import type { ReviewSettings } from '@/hooks/useReviewSettings';
import { isHttpUrl, readApiError, sendJson, withCompany, type SetupStepHandle } from './setup-api';
import {
  SUGGESTED_PROMPT_CRITERIA,
  SUGGESTED_PROMPT_FEEDBACK,
  SUGGESTED_PROMPT_FINAL,
  suggestedGreeting,
} from './review-defaults';
import type { SetupStatus } from './setup-status';

interface Props {
  companyId: string;
  companyName: string;
  status: SetupStatus | null;
}

interface FormState {
  dispatchHour: number;
  /** 'all' = todas as conexoes ativas (null na API). */
  inboxId: string;
  googleUrl: string;
  tripadvisorUrl: string;
  greeting: string;
  prompt1: string;
  prompt2: string;
  promptFinal: string;
  relatorioSemanal: boolean;
  /** Um e-mail por linha ou separados por virgula. */
  relatorioEmails: string;
}

type TextField = 'greeting' | 'prompt1' | 'prompt2' | 'promptFinal';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function separarEmails(texto: string): string[] {
  return texto
    .split(/[,;\n]/)
    .map((e) => e.trim())
    .filter(Boolean);
}

/**
 * Passo "IA Avaliacao": conteudo do fluxo de avaliacao (ReviewSettings) via
 * GET/PUT /api/reviews/settings com ?companyId= (personificacao do super-admin).
 * O liga/desliga do modulo fica no passo "Modos da IA".
 *
 * Campos de texto vazios chegam pre-preenchidos com uma sugestao (marcada na
 * tela); o que ja estava preenchido nao e tocado.
 */
export const StepReviews = forwardRef<SetupStepHandle, Props>(function StepReviews(
  { companyId, companyName, status },
  ref
) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [suggested, setSuggested] = useState<Set<TextField>>(new Set());
  const initedRef = useRef(false);

  const { data: settings, isLoading, isError } = useQuery<ReviewSettings>({
    queryKey: ['setup-review-settings', companyId],
    queryFn: async () => {
      const res = await apiFetch(withCompany('/api/reviews/settings', companyId));
      if (!res.ok) throw new Error(await readApiError(res, 'Falha ao carregar as configurações de avaliação'));
      return (await res.json()) as ReviewSettings;
    },
    enabled: !!companyId,
  });

  useEffect(() => {
    if (!settings || initedRef.current) return;
    initedRef.current = true;

    const sugestoes: Record<TextField, string> = {
      greeting: suggestedGreeting(companyName),
      prompt1: SUGGESTED_PROMPT_FEEDBACK,
      prompt2: SUGGESTED_PROMPT_CRITERIA,
      promptFinal: SUGGESTED_PROMPT_FINAL,
    };
    const prefilled = new Set<TextField>();
    const texto = (field: TextField): string => {
      const atual = settings[field];
      if (typeof atual === 'string' && atual.trim()) return atual;
      prefilled.add(field);
      return sugestoes[field];
    };

    setForm({
      dispatchHour: settings.dispatchHour ?? 9,
      inboxId: settings.inboxId ?? 'all',
      googleUrl: settings.googleUrl ?? '',
      tripadvisorUrl: settings.tripadvisorUrl ?? '',
      greeting: texto('greeting'),
      prompt1: texto('prompt1'),
      prompt2: texto('prompt2'),
      promptFinal: texto('promptFinal'),
      relatorioSemanal: settings.relatorioSemanal ?? false,
      relatorioEmails: (settings.relatorioEmails ?? []).join('\n'),
    });
    setSuggested(prefilled);
  }, [settings, companyName]);

  const set = (patch: Partial<FormState>) => setForm((p) => (p ? { ...p, ...patch } : p));
  const setText = (field: TextField, value: string) => {
    setForm((p) => (p ? { ...p, [field]: value } : p));
    setSuggested((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  };

  const activeInboxes = (status?.inboxes ?? []).filter((i) => i.isActive);
  const relatorioEmails = form?.relatorioEmails ?? '';
  const emails = useMemo(() => separarEmails(relatorioEmails), [relatorioEmails]);
  const emailsInvalidos = useMemo(() => emails.filter((e) => !EMAIL_VALIDO.test(e)), [emails]);

  useImperativeHandle(
    ref,
    () => ({
      save: async () => {
        if (!form) return true;
        if (!isHttpUrl(form.googleUrl) || !isHttpUrl(form.tripadvisorUrl)) {
          toast.error('Link de avaliação inválido', { description: 'Use o endereço completo, começando com https://' });
          return false;
        }
        if (emailsInvalidos.length > 0) {
          toast.error('Confira os e-mails do relatório', { description: `Endereço inválido: ${emailsInvalidos[0]}` });
          return false;
        }
        if (emails.length > 10) {
          toast.error('Máximo de 10 e-mails no relatório');
          return false;
        }
        try {
          await sendJson(
            withCompany('/api/reviews/settings', companyId),
            'PUT',
            {
              dispatchHour: form.dispatchHour,
              inboxId: form.inboxId === 'all' ? null : form.inboxId,
              googleUrl: form.googleUrl.trim(),
              tripadvisorUrl: form.tripadvisorUrl.trim(),
              greeting: form.greeting,
              prompt1: form.prompt1,
              prompt2: form.prompt2,
              promptFinal: form.promptFinal,
              relatorioSemanal: form.relatorioSemanal,
              relatorioEmails: emails,
            },
            'Erro ao salvar as configurações de avaliação'
          );
          setSuggested(new Set());
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['setup-review-settings', companyId] }),
            queryClient.invalidateQueries({ queryKey: ['review-settings'] }),
            queryClient.invalidateQueries({ queryKey: ['setup-checklist', companyId] }),
          ]);
          toast.success('Configurações de avaliação salvas');
          return true;
        } catch (e) {
          toast.error((e as Error).message);
          return false;
        }
      },
    }),
    [form, emails, emailsInvalidos, companyId, queryClient]
  );

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Não foi possível carregar as configurações de avaliação.</AlertDescription>
      </Alert>
    );
  }

  if (isLoading || !form) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    );
  }

  const suggestionBadge = (field: TextField) =>
    suggested.has(field) ? (
      <Badge variant="secondary" className="text-[10px]">
        Sugestão
      </Badge>
    ) : null;

  return (
    <div className="space-y-6">
      {status && status.review?.enabled === false && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            O módulo de avaliação ainda está desligado. Ele é ligado ao salvar o passo &quot;Modos da IA&quot;
            com IA Avaliação marcada.
          </AlertDescription>
        </Alert>
      )}

      {/* Disparo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-primary" />
            Disparo diário
          </CardTitle>
          <CardDescription>
            Todo dia nesse horário (Brasília) a pesquisa é enviada aos clientes atendidos.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="setup-dispatch-hour">Horário</Label>
            <Select value={String(form.dispatchHour)} onValueChange={(v) => set({ dispatchHour: Number(v) })}>
              <SelectTrigger id="setup-dispatch-hour">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map((h) => (
                  <SelectItem key={h} value={String(h)}>
                    {`${String(h).padStart(2, '0')}:00`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-dispatch-inbox">Conexão do disparo</Label>
            <Select value={form.inboxId} onValueChange={(v) => set({ inboxId: v })}>
              <SelectTrigger id="setup-dispatch-inbox">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as conexões ativas</SelectItem>
                {activeInboxes.map((inbox) => (
                  <SelectItem key={inbox.id} value={inbox.id}>
                    {inbox.name}
                    {inbox.phoneNumber ? `: ${inbox.phoneNumber}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Links */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4 text-primary" />
            Links de avaliação externa
          </CardTitle>
          <CardDescription>Para onde a IA convida os clientes satisfeitos.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="setup-google-url">Link do Google</Label>
            <Input
              id="setup-google-url"
              type="url"
              placeholder="https://g.page/r/..."
              value={form.googleUrl}
              onChange={(e) => set({ googleUrl: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-tripadvisor-url">Link do TripAdvisor</Label>
            <Input
              id="setup-tripadvisor-url"
              type="url"
              placeholder="https://www.tripadvisor.com.br/..."
              value={form.tripadvisorUrl}
              onChange={(e) => set({ tripadvisorUrl: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Saudacao + prompts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4 text-primary" />
            Mensagens da IA de avaliação
          </CardTitle>
          <CardDescription>
            Campos marcados como &quot;Sugestão&quot; estavam vazios e vêm com um texto padrão: edite à vontade.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="setup-greeting">Saudação inicial</Label>
              {suggestionBadge('greeting')}
            </div>
            <Textarea
              id="setup-greeting"
              rows={3}
              value={form.greeting}
              onChange={(e) => setText('greeting', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Bot className="h-3.5 w-3.5 text-muted-foreground" />
              <Label htmlFor="setup-prompt1">Prompt de feedback</Label>
              {suggestionBadge('prompt1')}
            </div>
            <Textarea
              id="setup-prompt1"
              rows={4}
              className="font-mono text-sm"
              value={form.prompt1}
              onChange={(e) => setText('prompt1', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Bot className="h-3.5 w-3.5 text-muted-foreground" />
              <Label htmlFor="setup-prompt2">Prompt de critério de resposta</Label>
              {suggestionBadge('prompt2')}
            </div>
            <Textarea
              id="setup-prompt2"
              rows={5}
              className="font-mono text-sm"
              value={form.prompt2}
              onChange={(e) => setText('prompt2', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Bot className="h-3.5 w-3.5 text-muted-foreground" />
              <Label htmlFor="setup-prompt-final">Resposta final ao cliente</Label>
              {suggestionBadge('promptFinal')}
            </div>
            <Textarea
              id="setup-prompt-final"
              rows={3}
              className="font-mono text-sm"
              value={form.promptFinal}
              onChange={(e) => setText('promptFinal', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Relatorio semanal */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-primary" />
            Resumo semanal por e-mail
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="setup-relatorio">Enviar toda segunda-feira</Label>
              <p className="text-xs text-muted-foreground">
                Nota média, total de avaliações e os assuntos mais elogiados e mais reclamados.
              </p>
            </div>
            <Switch
              id="setup-relatorio"
              checked={form.relatorioSemanal}
              onCheckedChange={(v) => set({ relatorioSemanal: v })}
            />
          </div>
          {form.relatorioSemanal && (
            <div className="space-y-2">
              <Label htmlFor="setup-relatorio-emails">Quem recebe</Label>
              <Textarea
                id="setup-relatorio-emails"
                rows={3}
                placeholder={'gerente@restaurante.com.br\ndono@restaurante.com.br'}
                value={form.relatorioEmails}
                onChange={(e) => set({ relatorioEmails: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Um por linha (ou separados por vírgula), até 10. Em branco, vai para o e-mail do restaurante.
              </p>
              {emailsInvalidos.length > 0 && (
                <p className="text-xs text-destructive">Endereço inválido: {emailsInvalidos.join(', ')}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
});

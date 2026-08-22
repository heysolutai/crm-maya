'use client';

import { useState, useEffect } from 'react';
import { useReviewSettings } from '@/hooks/useReviewSettings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ArrowLeft, Loader2, Save, Link2, Bot, MessageSquare, Power, Clock, Send } from 'lucide-react';

interface Props {
  onBack: () => void;
}

interface FormState {
  enabled: boolean;
  dispatchHour: number;
  googleUrl: string;
  tripadvisorUrl: string;
  prompt1: string;
  prompt2: string;
  greeting: string;
}

const EMPTY: FormState = {
  enabled: true,
  dispatchHour: 9,
  googleUrl: '',
  tripadvisorUrl: '',
  prompt1: '',
  prompt2: '',
  greeting: '',
};

const HOURS = Array.from({ length: 24 }, (_, h) => h);

const formatHour = (h: number) => `${String(h).padStart(2, '0')}:00`;

export function ReviewSettingsPanel({ onBack }: Props) {
  const { settings, isLoading, save, isSaving, dispatchNow, isDispatching } = useReviewSettings();
  const [form, setForm] = useState<FormState>(EMPTY);

  // Popula o formulário quando os dados chegam.
  useEffect(() => {
    if (settings) {
      setForm({
        enabled: settings.enabled ?? true,
        dispatchHour: settings.dispatchHour ?? 9,
        googleUrl: settings.googleUrl ?? '',
        tripadvisorUrl: settings.tripadvisorUrl ?? '',
        prompt1: settings.prompt1 ?? '',
        prompt2: settings.prompt2 ?? '',
        greeting: settings.greeting ?? '',
      });
    }
  }, [settings]);

  const set = (patch: Partial<FormState>) => setForm((p) => ({ ...p, ...patch }));

  const handleSave = () => save(form);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Configurações de avaliação</h1>
            <p className="text-muted-foreground text-sm">
              Links externos, prompts da IA e saudação inicial
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={isSaving || isLoading}>
          {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {/* Status do módulo (read-only — quem ativa é o suporte/super-admin) */}
          <Card>
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-lg',
                    form.enabled ? 'bg-emerald-500/10' : 'bg-muted'
                  )}
                >
                  <Power className={cn('h-4 w-4', form.enabled ? 'text-emerald-600' : 'text-muted-foreground')} />
                </span>
                <div>
                  <p className="font-medium text-sm">Módulo de avaliações</p>
                  <p className="text-xs text-muted-foreground">
                    {form.enabled
                      ? 'Ativo — a coleta diária de avaliações está habilitada.'
                      : 'Inativo — fale com o suporte para ativar.'}
                  </p>
                </div>
              </div>
              <Badge variant={form.enabled ? 'default' : 'secondary'}>
                {form.enabled ? 'Ativo' : 'Inativo'}
              </Badge>
            </CardContent>
          </Card>

          {/* Horário do disparo diário */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Horário do disparo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label htmlFor="dispatch-hour">Hora do envio diário das avaliações</Label>
              <Select
                value={String(form.dispatchHour)}
                onValueChange={(v) => set({ dispatchHour: Number(v) })}
              >
                <SelectTrigger id="dispatch-hour" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {formatHour(h)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Todos os dias nesse horário (fuso de Brasília) o sistema inicia a coleta de
                avaliações dos clientes atendidos.
              </p>
              <div className="pt-2">
                <Button
                  variant="outline"
                  onClick={() => dispatchNow()}
                  disabled={isDispatching || !form.enabled}
                >
                  {isDispatching ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Disparar agora
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Inicia a coleta imediatamente, sem esperar o horário programado.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Links externos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" />
                Links de avaliação externa
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="google-url">Link do Google</Label>
                <Input
                  id="google-url"
                  type="url"
                  placeholder="https://g.page/r/..."
                  value={form.googleUrl}
                  onChange={(e) => set({ googleUrl: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tripadvisor-url">Link do TripAdvisor</Label>
                <Input
                  id="tripadvisor-url"
                  type="url"
                  placeholder="https://www.tripadvisor.com/..."
                  value={form.tripadvisorUrl}
                  onChange={(e) => set({ tripadvisorUrl: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Prompts da IA */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                Prompts da IA
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="prompt1">Prompt de feedback</Label>
                <Textarea
                  id="prompt1"
                  rows={5}
                  placeholder="Instruções da IA para coletar o feedback do cliente sobre a experiência..."
                  value={form.prompt1}
                  onChange={(e) => set({ prompt1: e.target.value })}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prompt2">Prompt de critério de resposta</Label>
                <Textarea
                  id="prompt2"
                  rows={5}
                  placeholder="Critérios que a IA usa para responder / classificar a avaliação..."
                  value={form.prompt2}
                  onChange={(e) => set({ prompt2: e.target.value })}
                  className="font-mono text-sm"
                />
              </div>
            </CardContent>
          </Card>

          {/* Saudação inicial */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                Saudação inicial
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="greeting">Mensagem</Label>
                <Textarea
                  id="greeting"
                  rows={3}
                  placeholder="Ex: Olá! Poderia avaliar seu atendimento? Sua opinião é muito importante."
                  value={form.greeting}
                  onChange={(e) => set({ greeting: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar configurações
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

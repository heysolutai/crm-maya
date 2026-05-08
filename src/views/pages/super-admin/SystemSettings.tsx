import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Settings as SettingsIcon, Eye, EyeOff, CheckCircle2, XCircle, Zap } from 'lucide-react';

interface SystemSetting {
  key: string;
  label: string;
  description: string;
  is_secret: boolean;
  placeholder?: string;
  value: string | null;
  has_value: boolean;
  updated_at: string | null;
}

export default function SystemSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  // Tracks que campos secretos o user editou — pra nao mandar a mascara de volta
  const [editedSecrets, setEditedSecrets] = useState<Record<string, boolean>>({});

  const { data: settings, isLoading } = useQuery<SystemSetting[]>({
    queryKey: ['system-settings'],
    queryFn: async () => {
      const res = await fetch('/api/admin/system-settings');
      if (!res.ok) throw new Error('Falha ao buscar settings');
      return res.json();
    },
  });

  // Inicializa o estado do form quando dados chegam
  useEffect(() => {
    if (!settings) return;
    const initial: Record<string, string> = {};
    for (const s of settings) {
      initial[s.key] = s.value || '';
    }
    setValues(initial);
    setEditedSecrets({});
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Pra campos secretos: so manda se foi editado nesta sessao.
      // Senao a mascara "••••xyz" iria sobrescrever o valor real no banco.
      const toSave = (settings || []).map((s) => {
        if (s.is_secret && !editedSecrets[s.key]) {
          return null;
        }
        return { key: s.key, value: values[s.key] || null };
      }).filter((x): x is { key: string; value: string | null } => x !== null);

      const res = await fetch('/api/admin/system-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: toSave }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Falha ao salvar');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      toast({ title: 'Configurações salvas', description: 'Alterações entram em vigor imediatamente.' });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' });
    },
  });

  const handleChange = (key: string, value: string, isSecret: boolean) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (isSecret) setEditedSecrets((prev) => ({ ...prev, [key]: true }));
  };

  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; details?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const handleTestOpenAI = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/system-settings/test-openai');
      const data = await res.json();
      const details =
        data.length !== undefined
          ? `key ...${data.last_chars} (${data.length} chars${data.has_whitespace ? ', COM whitespace' : ''})`
          : undefined;
      setTestResult({
        ok: !!data.ok,
        message: data.message || (data.ok ? 'OK' : 'Falha'),
        details,
      });
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message || 'Erro de rede' });
    } finally {
      setTesting(false);
    }
  };

  const toggleReveal = (key: string) => {
    setRevealed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <SettingsIcon className="h-7 w-7" />
          Configurações do Sistema
        </h1>
        <p className="text-muted-foreground mt-1">
          URLs de webhook e chaves API globais. Editáveis em runtime — sem precisar reiniciar o servidor.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-5">
          {(settings || []).map((s) => {
            const isSecretMasked = s.is_secret && !editedSecrets[s.key] && !revealed[s.key];
            return (
              <div key={s.key} className="space-y-2">
                <Label htmlFor={s.key} className="font-medium">
                  {s.label}
                  {s.has_value && (
                    <span className="ml-2 text-xs text-emerald-600 font-normal">• configurado</span>
                  )}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id={s.key}
                    type={s.is_secret && !revealed[s.key] && !editedSecrets[s.key] ? 'password' : 'text'}
                    placeholder={s.placeholder}
                    value={isSecretMasked && s.has_value ? '' : values[s.key] || ''}
                    onChange={(e) => handleChange(s.key, e.target.value, s.is_secret)}
                    className="font-mono text-sm"
                  />
                  {s.is_secret && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => toggleReveal(s.key)}
                      title={revealed[s.key] ? 'Esconder' : 'Revelar'}
                    >
                      {revealed[s.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{s.description}</p>
                {s.is_secret && s.has_value && !editedSecrets[s.key] && (
                  <p className="text-[11px] text-muted-foreground italic">
                    Deixe em branco para manter o valor atual.
                  </p>
                )}
              </div>
            );
          })}

          <div className="flex items-center justify-between pt-2 gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleTestOpenAI} disabled={testing}>
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
              Testar key OpenAI
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar
            </Button>
          </div>

          {testResult && (
            <div className={`mt-2 rounded-md border p-3 text-sm ${testResult.ok ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900' : 'border-rose-200 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-900'}`}>
              <div className="flex items-center gap-2">
                {testResult.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                )}
                <span className="font-medium">{testResult.message}</span>
              </div>
              {testResult.details && (
                <p className="text-xs text-muted-foreground mt-1 font-mono">{testResult.details}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="pt-6 text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">Ordem de resolução</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Valor configurado aqui (DB)</li>
            <li>Variável de ambiente (legado — em breve descontinuado)</li>
            <li>Default no código</li>
          </ol>
          <p className="pt-2">
            Cache: 60 segundos. Quando você salva aqui, o cache é invalidado imediatamente.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Building2, Wifi, Key, Bot, Check, ChevronRight, ChevronLeft, AlertTriangle } from 'lucide-react';
import { useCompanyDetails } from '@/hooks/useCompanyDetails';
import { supabase } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { WhatsAppConfigCard } from '@/components/super-admin/company-details/WhatsAppConfigCard';
import { ApiKeysTab } from '@/components/super-admin/company-details/ApiKeysTab';

const steps = [
  { key: 'info', label: 'Dados da Empresa', icon: Building2, description: 'Informações básicas' },
  { key: 'whatsapp', label: 'WhatsApp', icon: Wifi, description: 'Conexão WhatsApp' },
  { key: 'api-keys', label: 'API Keys', icon: Key, description: 'Chaves de acesso' },
  { key: 'ai', label: 'Configurar IA', icon: Bot, description: 'Configuração básica' },
] as const;

export default function CompanySetup() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { toast } = useToast();
  const { company, isLoading, error } = useCompanyDetails(id);
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    trade_name: '',
    phone: '',
    document_number: '',
  });

  // Sync form data when company loads
  const [initialized, setInitialized] = useState(false);
  if (company && !initialized) {
    setFormData({
      trade_name: company.trade_name || '',
      phone: company.phone || '',
      document_number: (company as any).document_number || '',
    });
    setInitialized(true);
  }

  const handleSaveBasicInfo = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('companies')
        .update({
          trade_name: formData.trade_name || null,
          phone: formData.phone || null,
          document_number: formData.document_number || null,
        })
        .eq('id', id);

      if (error) throw error;
      toast({ title: 'Dados salvos com sucesso!' });
      setCurrentStep(1);
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteSetup = async () => {
    if (!id || !company) return;
    setSaving(true);
    try {
      const currentSettings = (company.settings as Record<string, any>) || {};
      const { error } = await supabase
        .from('companies')
        .update({
          settings: { ...currentSettings, setup_completed: true },
        })
        .eq('id', id);

      if (error) throw error;
      toast({ title: 'Setup concluído com sucesso!' });
      router.push(`/super-admin/companies/${id}`);
    } catch (err: any) {
      toast({ title: 'Erro ao concluir setup', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Empresa não encontrada</h2>
          <Button onClick={() => router.push('/super-admin/companies')}>Voltar</Button>
        </div>
      </div>
    );
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <Card>
            <CardHeader>
              <CardTitle>Dados da Empresa</CardTitle>
              <CardDescription>Complete as informações básicas da empresa</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Razão Social</Label>
                  <Input value={company.name} disabled className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trade_name">Nome Fantasia</Label>
                  <Input
                    id="trade_name"
                    value={formData.trade_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, trade_name: e.target.value }))}
                    placeholder="Nome fantasia da empresa"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="(11) 99999-9999"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="document_number">CNPJ / CPF</Label>
                  <Input
                    id="document_number"
                    value={formData.document_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, document_number: e.target.value }))}
                    placeholder="00.000.000/0001-00"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <Button onClick={handleSaveBasicInfo} disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar e Continuar'}
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      case 1:
        return (
          <Card>
            <CardHeader>
              <CardTitle>Conectar WhatsApp</CardTitle>
              <CardDescription>Configure a instância do WhatsApp para esta empresa</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <WhatsAppConfigCard companyId={id!} />
              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep(0)}>
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Voltar
                </Button>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setCurrentStep(2)}>
                    Pular
                  </Button>
                  <Button onClick={() => setCurrentStep(2)}>
                    Continuar
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      case 2:
        return (
          <Card>
            <CardHeader>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>Crie as chaves de API para integrações externas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ApiKeysTab companyId={id!} />
              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep(1)}>
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Voltar
                </Button>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setCurrentStep(3)}>
                    Pular
                  </Button>
                  <Button onClick={() => setCurrentStep(3)}>
                    Continuar
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      case 3:
        return (
          <Card>
            <CardHeader>
              <CardTitle>Configurar IA</CardTitle>
              <CardDescription>Configure o comportamento da IA para esta empresa</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col items-center justify-center py-8">
                <Bot className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4 text-center max-w-md">
                  As configurações de IA foram criadas automaticamente com valores padrão.
                  Você pode personalizá-las agora ou fazer isso depois.
                </p>
                <Button
                  variant="outline"
                  onClick={() => router.push(`/super-admin/companies/${company.id}/ai-settings`)}
                >
                  Personalizar Configurações de IA
                </Button>
              </div>
              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep(2)}>
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Voltar
                </Button>
                <Button onClick={handleCompleteSetup} disabled={saving}>
                  {saving ? 'Concluindo...' : 'Concluir Setup'}
                  <Check className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      default:
        return null;
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="h-6 w-6" />
          Setup: {company.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Complete as etapas abaixo para configurar a empresa
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          return (
            <div key={step.key} className="flex items-center flex-1">
              <button
                onClick={() => setCurrentStep(index)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors w-full',
                  isCurrent
                    ? 'bg-primary text-primary-foreground'
                    : isCompleted
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4 shrink-0" />
                ) : (
                  <Icon className="h-4 w-4 shrink-0" />
                )}
                <span className="hidden sm:inline truncate">{step.label}</span>
              </button>
              {index < steps.length - 1 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mx-1" />
              )}
            </div>
          );
        })}
      </div>

      {/* Content */}
      {renderStepContent()}
    </div>
  );
}

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Save, Building2 } from 'lucide-react';
import { useCompanies, Company } from '@/hooks/useCompanies';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface BasicInfoTabProps {
  company: Company;
}

export function BasicInfoTab({ company }: BasicInfoTabProps) {
  const { updateCompany, isUpdating } = useCompanies();
  const [formData, setFormData] = useState({
    name: company.name,
    trade_name: company.trade_name || '',
    email: company.email,
    phone: company.phone || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateCompany({ id: company.id, updates: formData });
  };

  const getStatusBadge = () => {
    const statusMap = {
      trial: { label: 'Trial', variant: 'secondary' as const },
      active: { label: 'Ativo', variant: 'default' as const },
      cancelled: { label: 'Cancelado', variant: 'destructive' as const },
      suspended: { label: 'Suspenso', variant: 'destructive' as const },
    };
    return statusMap[company.subscription_status];
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Informações Básicas
          </CardTitle>
          <CardDescription>
            Gerencie as informações básicas da empresa
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da Empresa *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="trade_name">Nome Fantasia</Label>
                <Input
                  id="trade_name"
                  value={formData.trade_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, trade_name: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>
            </div>

            <Button type="submit" disabled={isUpdating}>
              <Save className="h-4 w-4 mr-2" />
              {isUpdating ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Informações do Sistema</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Status da Assinatura</span>
            <Badge variant={getStatusBadge().variant}>{getStatusBadge().label}</Badge>
          </div>

          {company.subscription_status === 'trial' && company.trial_ends_at && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Trial termina em</span>
              <span className="text-sm font-medium">
                {format(new Date(company.trial_ends_at), 'dd/MM/yyyy', { locale: ptBR })}
              </span>
            </div>
          )}

          {company.subscription_expires_at && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Assinatura expira em</span>
              <span className="text-sm font-medium">
                {format(new Date(company.subscription_expires_at), 'dd/MM/yyyy', { locale: ptBR })}
              </span>
            </div>
          )}

          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Criado em</span>
            <span className="text-sm font-medium">
              {format(new Date(company.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Última atualização</span>
            <span className="text-sm font-medium">
              {format(new Date(company.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">ID da Empresa</span>
            <code className="text-xs bg-muted px-2 py-1 rounded">{company.id}</code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

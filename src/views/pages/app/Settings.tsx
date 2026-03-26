import { useState } from 'react';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useFunnelStages } from '@/hooks/useFunnelStages';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Building2, Workflow, Plus, Trash2, Clock, Shield } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AppointmentSettingsConfig } from '@/components/appointments/AppointmentSettingsConfig';
import { RolePermissionsConfig } from '@/components/settings/RolePermissionsConfig';
import { TeamSignaturesConfig } from '@/components/settings/TeamSignaturesConfig';
import { ReminderSettingsConfig } from '@/components/appointments/ReminderSettingsConfig';

export default function Settings() {
  const { company, updateCompany } = useCompanySettings();
  const { stages, createStage, deleteStage } = useFunnelStages();
  const { toast } = useToast();
  const [isStageDialogOpen, setIsStageDialogOpen] = useState(false);
  const [companyForm, setCompanyForm] = useState({
    name: company?.name || '',
    trade_name: company?.trade_name || '',
    email: company?.email || '',
    phone: company?.phone || '',
    document_number: company?.document_number || '',
  });

  const [stageForm, setStageForm] = useState({
    name: '',
    description: '',
    color: '#0066cc',
    is_final: false,
  });

  const handleCompanyUpdate = () => {
    updateCompany(companyForm);
  };

  const handleStageCreate = () => {
    createStage(stageForm);
    setIsStageDialogOpen(false);
    setStageForm({ name: '', description: '', color: '#0066cc', is_final: false });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground text-sm">Gerencie as configurações da sua empresa</p>
      </div>

      <Tabs defaultValue="company" className="space-y-6">
        <TabsList className="w-full h-auto p-1 grid grid-cols-2 sm:grid-cols-4 gap-1 bg-muted/50 rounded-lg">
          <TabsTrigger
            value="company"
            className="flex items-center justify-center gap-2 py-2.5 px-2 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md text-xs sm:text-sm"
          >
            <Building2 className="h-4 w-4 shrink-0" />
            Empresa
          </TabsTrigger>
          <TabsTrigger
            value="appointments"
            className="flex items-center justify-center gap-2 py-2.5 px-2 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md text-xs sm:text-sm"
          >
            <Clock className="h-4 w-4 shrink-0" />
            Horários
          </TabsTrigger>
          <TabsTrigger
            value="funnel"
            className="flex items-center justify-center gap-2 py-2.5 px-2 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md text-xs sm:text-sm"
          >
            <Workflow className="h-4 w-4 shrink-0" />
            Funil
          </TabsTrigger>
          <TabsTrigger
            value="permissions"
            className="flex items-center justify-center gap-2 py-2.5 px-2 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md text-xs sm:text-sm"
          >
            <Shield className="h-4 w-4 shrink-0" />
            Permissões
          </TabsTrigger>
        </TabsList>

        {/* Tab Empresa */}
        <TabsContent value="company" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Dados da Empresa</CardTitle>
              <CardDescription>Informações básicas da sua empresa</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Razão Social *</Label>
                  <Input
                    id="name"
                    value={companyForm.name}
                    onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trade_name">Nome Fantasia</Label>
                  <Input
                    id="trade_name"
                    value={companyForm.trade_name}
                    onChange={(e) => setCompanyForm({ ...companyForm, trade_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={companyForm.email}
                    onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    value={companyForm.phone}
                    onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="document">CNPJ/CPF</Label>
                  <Input
                    id="document"
                    value={companyForm.document_number}
                    onChange={(e) => setCompanyForm({ ...companyForm, document_number: e.target.value })}
                  />
                </div>
              </div>
              <Button onClick={handleCompanyUpdate}>Salvar Alterações</Button>
            </CardContent>
          </Card>

          {/* Lead Distribution Config */}
          <Card>
            <CardHeader>
              <CardTitle>Distribuição Automática de Leads</CardTitle>
              <CardDescription>Distribua novos leads automaticamente entre os atendentes ativos (round-robin)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Ativar distribuição automática</Label>
                  <p className="text-xs text-muted-foreground">
                    Cada novo lead será atribuído ao próximo atendente da fila, de forma circular.
                  </p>
                </div>
                <Switch
                  checked={(company?.settings as Record<string, any> | null)?.lead_distribution_enabled || false}
                  onCheckedChange={async (checked) => {
                    const currentSettings = (company?.settings as Record<string, any>) || {};
                    await updateCompany({
                      settings: { ...currentSettings, lead_distribution_enabled: checked },
                    });
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Report WhatsApp Group Config */}
          <Card>
            <CardHeader>
              <CardTitle>Grupo de Relatórios WhatsApp</CardTitle>
              <CardDescription>Configure o número/ID do grupo que receberá os relatórios diários</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="report_group_phone">Número do Grupo</Label>
                <Input
                  id="report_group_phone"
                  placeholder="Ex: 5511999999999-1234567890@g.us"
                  value={(company?.settings as Record<string, any> | null)?.report_group_phone || ''}
                  onChange={async (e) => {
                    const currentSettings = (company?.settings as Record<string, any>) || {};
                    await updateCompany({
                      settings: { ...currentSettings, report_group_phone: e.target.value },
                    });
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Informe o número do grupo WhatsApp (incluindo @g.us para grupos) que receberá o relatório diário.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Agendamentos */}
        <TabsContent value="appointments" className="space-y-4">
          <AppointmentSettingsConfig variant="single-card" />
          <ReminderSettingsConfig />
        </TabsContent>

        {/* Tab Funil */}
        <TabsContent value="funnel" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Stages do Funil</CardTitle>
                <CardDescription>Gerencie as etapas do seu funil de vendas</CardDescription>
              </div>
              <Dialog open={isStageDialogOpen} onOpenChange={setIsStageDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar Stage
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nova Stage</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="stage_name">Nome *</Label>
                      <Input
                        id="stage_name"
                        value={stageForm.name}
                        onChange={(e) => setStageForm({ ...stageForm, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="stage_desc">Descrição</Label>
                      <Textarea
                        id="stage_desc"
                        value={stageForm.description}
                        onChange={(e) => setStageForm({ ...stageForm, description: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="stage_color">Cor</Label>
                      <Input
                        id="stage_color"
                        type="color"
                        value={stageForm.color}
                        onChange={(e) => setStageForm({ ...stageForm, color: e.target.value })}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={stageForm.is_final}
                        onCheckedChange={(checked) => setStageForm({ ...stageForm, is_final: checked })}
                      />
                      <Label>Stage Final (Fechado/Perdido)</Label>
                    </div>
                    <Button onClick={handleStageCreate} className="w-full" disabled={!stageForm.name}>
                      Criar Stage
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ordem</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Cor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stages?.map((stage, index) => (
                    <TableRow key={stage.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-medium">{stage.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded border"
                            style={{ backgroundColor: stage.color }}
                          />
                          <span className="text-sm text-muted-foreground">{stage.color}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {stage.is_default && <Badge variant="secondary">Padrão</Badge>}
                          {stage.is_final && <Badge>Final</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteStage(stage.id)}
                          disabled={stage.is_default}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Permissões */}
        <TabsContent value="permissions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Permissões por Role</CardTitle>
              <CardDescription>
                Configure as permissões padrão para cada tipo de usuário (role)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RolePermissionsConfig />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assinaturas de Mensagem</CardTitle>
              <CardDescription>
                Configure a assinatura individual de cada membro da equipe
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TeamSignaturesConfig />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

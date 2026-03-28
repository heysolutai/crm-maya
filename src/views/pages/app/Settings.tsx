import { useState, useEffect } from 'react';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useFunnelStages } from '@/hooks/useFunnelStages';
import { useWhatsAppIntegration } from '@/hooks/useWhatsAppIntegration';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Building2, Workflow, Plus, Trash2, Clock, Shield, Plug, Smartphone, Loader2, Eye, EyeOff, Copy, RefreshCw, QrCode, ExternalLink, Zap, Key } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AppointmentSettingsConfig } from '@/components/appointments/AppointmentSettingsConfig';
import { RolePermissionsConfig } from '@/components/settings/RolePermissionsConfig';
import { TeamSignaturesConfig } from '@/components/settings/TeamSignaturesConfig';
import { ReminderSettingsConfig } from '@/components/appointments/ReminderSettingsConfig';
import { FollowUpsSubTab } from '@/components/super-admin/company-details/ai-config/FollowUpsSubTab';
import { ApiKeysTab } from '@/components/super-admin/company-details/ApiKeysTab';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';
import { cn } from '@/lib/utils';

interface MenuItem {
  id: string;
  label: string;
  icon: any;
  description: string;
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}

const menuGroups: MenuGroup[] = [
  {
    label: 'Geral',
    items: [
      { id: 'company', label: 'Empresa', icon: Building2, description: 'Dados e configurações gerais' },
      { id: 'permissions', label: 'Permissões', icon: Shield, description: 'Roles e assinaturas' },
    ],
  },
  {
    label: 'Integrações',
    items: [
      { id: 'connections', label: 'Conexões', icon: Plug, description: 'WhatsApp e integrações' },
      { id: 'automations', label: 'Automações', icon: Zap, description: 'Follow-ups automáticos' },
      { id: 'api-keys', label: 'API Keys', icon: Key, description: 'Chaves de acesso à API' },
    ],
  },
  {
    label: 'Vendas',
    items: [
      { id: 'appointments', label: 'Horários', icon: Clock, description: 'Agendamentos e lembretes' },
      { id: 'funnel', label: 'Funil', icon: Workflow, description: 'Etapas do funil de vendas' },
    ],
  },
];

const allMenuItems = menuGroups.flatMap(g => g.items);

export default function Settings() {
  const { company, updateCompany } = useCompanySettings();
  const { stages, createStage, deleteStage } = useFunnelStages();
  const {
    instances,
    isLoading: isWhatsAppLoading,
    connectWhatsApp,
    reconnectWhatsApp,
    disconnectWhatsApp,
    deleteWhatsApp,
    updateStatus,
    isConnecting,
    isReconnecting,
    isDisconnecting,
    isDeleting,
    isUpdating,
  } = useWhatsAppIntegration();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { effectiveCompanyId } = useEffectiveCompanyId();

  const [activeSection, setActiveSection] = useState('company');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [deleteWaConfirm, setDeleteWaConfirm] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });

  // Polling when QR modal is open
  useEffect(() => {
    if (!isQrModalOpen || !selectedInstanceId) return;
    const intervalId = setInterval(() => {
      updateStatus(selectedInstanceId);
    }, 3000);
    return () => clearInterval(intervalId);
  }, [isQrModalOpen, selectedInstanceId, updateStatus]);

  // Auto-close modal when connected
  useEffect(() => {
    if (selectedInstanceId && instances) {
      const instance = instances.find((i: any) => i.id === selectedInstanceId);
      if (instance?.status === 'connected' && isQrModalOpen) {
        toast({ title: 'WhatsApp Conectado!', description: `Instância ${instance.instance_name} conectada com sucesso` });
        setIsQrModalOpen(false);
        setSelectedInstanceId(null);
      }
    }
  }, [instances, selectedInstanceId, isQrModalOpen, toast]);

  const handleWhatsAppConnect = async () => {
    try {
      const result: any = await new Promise((resolve, reject) => {
        connectWhatsApp(undefined, { onSuccess: resolve, onError: reject });
      });
      const newInstanceId = result?.data?.id || result?.instance_id;
      if (newInstanceId) {
        setSelectedInstanceId(newInstanceId);
        setIsQrModalOpen(true);
      }
    } catch {
      // handled by hook
    }
  };

  const handleWaReconnect = async (instanceId: string) => {
    setSelectedInstanceId(instanceId);
    try {
      const result: any = await new Promise((resolve, reject) => {
        reconnectWhatsApp(instanceId, { onSuccess: resolve, onError: reject });
      });
      if (result?.already_connected) {
        toast({ title: 'WhatsApp já conectado', description: 'Esta instância já está conectada ao WhatsApp.' });
        return;
      }
      setIsQrModalOpen(true);
    } catch {
      setIsQrModalOpen(true);
    }
  };

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

  // ─── Sidebar nav item ───
  const NavButton = ({ item }: { item: MenuItem }) => {
    const Icon = item.icon;
    const isActive = activeSection === item.id;
    return (
      <button
        onClick={() => setActiveSection(item.id)}
        className={cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm cursor-pointer w-full',
          'transition-colors duration-150 ease-in-out',
          isActive
            ? 'bg-primary text-primary-foreground font-medium'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate flex-1">{item.label}</span>
      </button>
    );
  };

  // ─── Desktop sidebar ───
  const DesktopSidebar = () => (
    <nav className="space-y-4">
      {menuGroups.map((group) => (
        <div key={group.label}>
          <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <NavButton key={item.id} item={item} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  // ─── Mobile horizontal nav ───
  const MobileNav = () => (
    <div className="overflow-x-auto -mx-4 px-4 pb-1">
      <div className="flex gap-1.5 w-max">
        {allMenuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium cursor-pointer',
                'transition-colors duration-150 ease-in-out whitespace-nowrap border',
                isActive
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-accent'
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  // ─── Section content ───
  const renderSection = () => {
    switch (activeSection) {
      case 'company':
        return <CompanySection companyForm={companyForm} setCompanyForm={setCompanyForm} handleCompanyUpdate={handleCompanyUpdate} company={company} updateCompany={updateCompany} />;
      case 'connections':
        return (
          <ConnectionsSection
            instances={instances}
            isWhatsAppLoading={isWhatsAppLoading}
            handleWhatsAppConnect={handleWhatsAppConnect}
            handleWaReconnect={handleWaReconnect}
            disconnectWhatsApp={disconnectWhatsApp}
            updateStatus={updateStatus}
            visibleKeys={visibleKeys}
            setVisibleKeys={setVisibleKeys}
            setDeleteWaConfirm={setDeleteWaConfirm}
            isConnecting={isConnecting}
            isReconnecting={isReconnecting}
            isDisconnecting={isDisconnecting}
            isDeleting={isDeleting}
            isUpdating={isUpdating}
            toast={toast}
          />
        );
      case 'automations':
        return effectiveCompanyId ? <FollowUpsSubTab companyId={effectiveCompanyId} /> : null;
      case 'api-keys':
        return effectiveCompanyId ? <ApiKeysTab companyId={effectiveCompanyId} /> : null;
      case 'appointments':
        return (
          <div className="space-y-4">
            <AppointmentSettingsConfig variant="single-card" />
            <ReminderSettingsConfig />
          </div>
        );
      case 'funnel':
        return (
          <FunnelSection
            stages={stages}
            stageForm={stageForm}
            setStageForm={setStageForm}
            isStageDialogOpen={isStageDialogOpen}
            setIsStageDialogOpen={setIsStageDialogOpen}
            handleStageCreate={handleStageCreate}
            deleteStage={deleteStage}
          />
        );
      case 'permissions':
        return (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Permissões por Role</CardTitle>
                <CardDescription>Configure as permissões padrão para cada tipo de usuário (role)</CardDescription>
              </CardHeader>
              <CardContent>
                <RolePermissionsConfig />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Assinaturas de Mensagem</CardTitle>
                <CardDescription>Configure a assinatura individual de cada membro da equipe</CardDescription>
              </CardHeader>
              <CardContent>
                <TeamSignaturesConfig />
              </CardContent>
            </Card>
          </div>
        );
      default:
        return null;
    }
  };

  const activeItem = allMenuItems.find(m => m.id === activeSection);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground text-sm">Gerencie as configurações da sua empresa</p>
      </div>

      {isMobile ? (
        // Mobile: pill nav + content below
        <div className="space-y-4">
          <MobileNav />
          <div>
            <div className="mb-4">
              <h2 className="text-lg font-semibold">{activeItem?.label}</h2>
              <p className="text-xs text-muted-foreground">{activeItem?.description}</p>
            </div>
            {renderSection()}
          </div>
        </div>
      ) : (
        // Desktop: grouped sidebar + content
        <div className="flex gap-8 items-start">
          <div className="w-52 shrink-0">
            <div className="sticky top-6">
              <DesktopSidebar />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="mb-6">
              <h2 className="text-xl font-semibold">{activeItem?.label}</h2>
              <p className="text-sm text-muted-foreground">{activeItem?.description}</p>
            </div>
            {renderSection()}
          </div>
        </div>
      )}

      {/* WhatsApp QR Code Modal */}
      <Dialog open={isQrModalOpen} onOpenChange={setIsQrModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Conectar WhatsApp</DialogTitle>
            {selectedInstanceId && (
              <p className="text-sm text-muted-foreground">
                Instância: <span className="font-medium">
                  {instances?.find((i: any) => i.id === selectedInstanceId)?.instance_name}
                </span>
              </p>
            )}
          </DialogHeader>

          <div className="space-y-6">
            {selectedInstanceId && instances?.find((i: any) => i.id === selectedInstanceId)?.qr_code ? (
              <>
                <div className="flex items-center justify-center">
                  <div className="border-4 border-foreground rounded-lg p-4 bg-background">
                    <img
                      src={instances.find((i: any) => i.id === selectedInstanceId)!.qr_code!}
                      alt="QR Code WhatsApp"
                      className="w-72 h-72"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Aguardando conexão...</span>
                </div>

                <div className="space-y-2 text-sm">
                  <p className="font-medium text-center mb-3">Como conectar:</p>
                  <ol className="space-y-2 text-muted-foreground">
                    <li className="flex gap-2"><span className="font-medium">1.</span><span>Abra o WhatsApp no celular</span></li>
                    <li className="flex gap-2"><span className="font-medium">2.</span><span>Toque em <strong>Mais opções &rarr; Aparelhos conectados</strong></span></li>
                    <li className="flex gap-2"><span className="font-medium">3.</span><span>Toque em <strong>Conectar um aparelho</strong></span></li>
                    <li className="flex gap-2"><span className="font-medium">4.</span><span>Aponte o celular para esta tela</span></li>
                  </ol>
                </div>

                <Button
                  variant="outline"
                  onClick={() => handleWaReconnect(selectedInstanceId)}
                  disabled={isReconnecting}
                  className="w-full"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Gerar Novo QR Code
                </Button>
              </>
            ) : (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {isReconnecting ? 'Gerando QR Code...' : 'QR Code não disponível'}
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteWaConfirm.open}
        onOpenChange={(open) => setDeleteWaConfirm({ open, id: open ? deleteWaConfirm.id : null })}
        title="Excluir Instância WhatsApp"
        description="Tem certeza que deseja excluir permanentemente esta instância do WhatsApp? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={async () => {
          if (deleteWaConfirm.id) {
            deleteWhatsApp(deleteWaConfirm.id);
            setDeleteWaConfirm({ open: false, id: null });
          }
        }}
      />
    </div>
  );
}

// ─── Company Section ───
function CompanySection({ companyForm, setCompanyForm, handleCompanyUpdate, company, updateCompany }: any) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Dados da Empresa</CardTitle>
          <CardDescription>Informações básicas da sua empresa</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Razão Social *</Label>
              <Input id="name" value={companyForm.name} onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trade_name">Nome Fantasia</Label>
              <Input id="trade_name" value={companyForm.trade_name} onChange={(e) => setCompanyForm({ ...companyForm, trade_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" value={companyForm.email} onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" value={companyForm.phone} onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="document">CNPJ/CPF</Label>
              <Input id="document" value={companyForm.document_number} onChange={(e) => setCompanyForm({ ...companyForm, document_number: e.target.value })} />
            </div>
          </div>
          <Button onClick={handleCompanyUpdate}>Salvar Alterações</Button>
        </CardContent>
      </Card>

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
                await updateCompany({ settings: { ...currentSettings, lead_distribution_enabled: checked } });
              }}
            />
          </div>
        </CardContent>
      </Card>

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
                await updateCompany({ settings: { ...currentSettings, report_group_phone: e.target.value } });
              }}
            />
            <p className="text-xs text-muted-foreground">
              Informe o número do grupo WhatsApp (incluindo @g.us para grupos) que receberá o relatório diário.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Connections Section ───
function ConnectionsSection({
  instances, isWhatsAppLoading, handleWhatsAppConnect, handleWaReconnect,
  disconnectWhatsApp, updateStatus, visibleKeys, setVisibleKeys,
  setDeleteWaConfirm, isConnecting, isReconnecting, isDisconnecting,
  isDeleting, isUpdating, toast,
}: any) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            WhatsApp (UazAPI)
          </CardTitle>
          <CardDescription>Conecte sua conta do WhatsApp para enviar e receber mensagens pelo CRM</CardDescription>
        </CardHeader>
        <CardContent>
          {isWhatsAppLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !instances || instances.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Smartphone className="h-16 w-16 text-muted-foreground/40" />
              <div className="text-center">
                <h3 className="text-lg font-medium mb-1">WhatsApp não conectado</h3>
                <p className="text-sm text-muted-foreground">Conecte sua conta do WhatsApp para começar a atender clientes</p>
              </div>
              <Button onClick={handleWhatsAppConnect} disabled={isConnecting} size="lg" className="px-8">
                {isConnecting ? (
                  <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Conectando...</>
                ) : (
                  <><Smartphone className="h-5 w-5 mr-2" /> Conectar WhatsApp</>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {instances.map((inst: any) => (
                <div key={inst.id} className="border rounded-lg p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Smartphone className="h-6 w-6 text-muted-foreground" />
                      <div>
                        <h3 className="font-semibold">WhatsApp</h3>
                        <p className="text-xs text-muted-foreground">{inst.instance_name}</p>
                      </div>
                    </div>
                    <Badge
                      variant={
                        inst.status === 'connected' ? 'default' :
                        inst.status === 'connecting' ? 'secondary' :
                        inst.status === 'error' ? 'destructive' : 'outline'
                      }
                      className="text-xs px-3 py-1"
                    >
                      {inst.status === 'connected' && '🟢 Conectado'}
                      {inst.status === 'connecting' && '🟡 Conectando'}
                      {inst.status === 'disconnected' && '🔴 Desconectado'}
                      {inst.status === 'error' && '🔴 Erro'}
                    </Badge>
                  </div>

                  {inst.instance_api_key && (
                    <div className="space-y-1 pt-2 border-t">
                      <Label className="text-xs text-muted-foreground">API Key</Label>
                      <div className="flex gap-1">
                        <div className="relative flex-1">
                          <Input
                            type={visibleKeys[inst.id] ? 'text' : 'password'}
                            value={inst.instance_api_key}
                            readOnly
                            className="h-8 font-mono text-xs bg-muted pr-8"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-8 w-8"
                            onClick={() => setVisibleKeys((prev: any) => ({ ...prev, [inst.id]: !prev[inst.id] }))}
                          >
                            {visibleKeys[inst.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </Button>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            navigator.clipboard.writeText(inst.instance_api_key!);
                            toast({ title: 'API Key copiada!' });
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {inst.error_message && (
                    <div className="p-3 bg-destructive/10 border border-destructive rounded text-sm text-destructive">
                      {inst.error_message}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
                    {inst.status === 'connected' && (() => {
                      const metadata = inst.metadata as any;
                      const phone = metadata?.connected_phone
                        || (() => {
                          const jid = metadata?.instance?.phone || metadata?.instance?.me || metadata?.instance?.owner || metadata?.status?.jid;
                          return jid ? String(jid).replace(/@.*$/, '').replace(/\D/g, '') : null;
                        })();
                      if (!phone || phone.length < 10) return null;
                      return (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-green-600 border-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                          onClick={() => window.open(`https://wa.me/${phone}`, '_blank')}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Abrir WhatsApp ({phone})
                        </Button>
                      );
                    })()}

                    {(inst.status === 'disconnected' || inst.status === 'connecting') && (
                      <Button variant="default" size="sm" onClick={() => handleWaReconnect(inst.id)} disabled={isReconnecting} className="flex-1">
                        <QrCode className="h-4 w-4 mr-2" />
                        Conectar WhatsApp
                      </Button>
                    )}

                    {inst.status === 'connected' && (
                      <Button variant="outline" size="sm" onClick={() => disconnectWhatsApp(inst.id)} disabled={isDisconnecting} className="flex-1">
                        <Smartphone className="h-4 w-4 mr-2" />
                        Desconectar
                      </Button>
                    )}

                    <Button variant="ghost" size="sm" onClick={() => updateStatus(inst.id)} disabled={isUpdating} title="Atualizar Status">
                      <RefreshCw className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteWaConfirm({ open: true, id: inst.id })}
                      disabled={isDeleting}
                    >
                      {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
          <div className="text-center">
            <Plug className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Mais integrações em breve</p>
            <p className="text-xs mt-1">Google Calendar, N8N, APIs externas...</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Funnel Section ───
function FunnelSection({ stages, stageForm, setStageForm, isStageDialogOpen, setIsStageDialogOpen, handleStageCreate, deleteStage }: any) {
  return (
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
                <Input id="stage_name" value={stageForm.name} onChange={(e) => setStageForm({ ...stageForm, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stage_desc">Descrição</Label>
                <Textarea id="stage_desc" value={stageForm.description} onChange={(e) => setStageForm({ ...stageForm, description: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stage_color">Cor</Label>
                <Input id="stage_color" type="color" value={stageForm.color} onChange={(e) => setStageForm({ ...stageForm, color: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={stageForm.is_final} onCheckedChange={(checked) => setStageForm({ ...stageForm, is_final: checked })} />
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
            {stages?.map((stage: any, index: number) => (
              <TableRow key={stage.id}>
                <TableCell>{index + 1}</TableCell>
                <TableCell className="font-medium">{stage.name}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded border" style={{ backgroundColor: stage.color }} />
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
                  <Button variant="ghost" size="sm" onClick={() => deleteStage(stage.id)} disabled={stage.is_default}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

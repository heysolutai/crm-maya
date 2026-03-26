import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Smartphone, Loader2, Eye, EyeOff, Copy, RefreshCw, Trash2, QrCode, ExternalLink } from 'lucide-react';
import { useWhatsAppIntegrationForCompany } from '@/hooks/useWhatsAppIntegrationForCompany';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface WhatsAppConfigCardProps {
  companyId: string;
}

export function WhatsAppConfigCard({ companyId }: WhatsAppConfigCardProps) {
  const { toast } = useToast();
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });

  const {
    instances,
    isLoading,
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
  } = useWhatsAppIntegrationForCompany(companyId);

  // Polling automático quando modal está aberto
  useEffect(() => {
    if (!isQrModalOpen || !selectedInstanceId) {
      return;
    }

    console.log('🔄 Iniciando polling de status...');
    
    // Verificar a cada 3 segundos
    const intervalId = setInterval(() => {
      console.log('⏱️ Verificando status da conexão...');
      updateStatus(selectedInstanceId);
    }, 3000);

    return () => {
      clearInterval(intervalId);
      console.log('⏹️ Polling encerrado');
    };
  }, [isQrModalOpen, selectedInstanceId, updateStatus]);

  // Fechar modal automaticamente quando conectar
  useEffect(() => {
    if (selectedInstanceId && instances) {
      const instance = instances.find(i => i.id === selectedInstanceId);
      
      if (instance?.status === 'connected' && isQrModalOpen) {
        console.log('✅ WhatsApp conectado com sucesso!');
        toast({ 
          title: '✅ WhatsApp Conectado!',
          description: `Instância ${instance.instance_name} conectada com sucesso`,
        });
        setIsQrModalOpen(false);
        setSelectedInstanceId(null);
      }
    }
  }, [instances, selectedInstanceId, isQrModalOpen, toast]);

  const handleWhatsAppConnect = async () => {
    try {
      const result = await connectWhatsApp();
      const newInstanceId = result?.data?.id || result?.instance_id;
      if (newInstanceId) {
        setSelectedInstanceId(newInstanceId);
        setIsQrModalOpen(true);
      }
    } catch (error: any) {
      // Error is already handled by the hook's onError
    }
  };

  const handleReconnect = async (instanceId: string) => {
    setSelectedInstanceId(instanceId);
    try {
      const result = await reconnectWhatsApp(instanceId);
      if (result.already_connected) {
        toast({
          title: 'WhatsApp já conectado',
          description: 'Esta instância já está conectada ao WhatsApp.',
        });
        return;
      }
      setIsQrModalOpen(true);
    } catch (error: any) {
      // Abre modal mesmo em erro para mostrar QR existente
      setIsQrModalOpen(true);
    }
  };

  const toggleKeyVisibility = (instanceId: string) => {
    setVisibleKeys(prev => ({ ...prev, [instanceId]: !prev[instanceId] }));
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Instâncias de WhatsApp
          </CardTitle>
          <CardDescription>Configure a integração com WhatsApp</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Instâncias de WhatsApp
          </CardTitle>
          <CardDescription>Configure a integração com WhatsApp</CardDescription>
        </CardHeader>
        <CardContent>
          {!instances || instances.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="text-center mb-4">
                <Smartphone className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">WhatsApp não conectado</h3>
                <p className="text-sm text-muted-foreground">
                  Conecte sua conta do WhatsApp para receber e enviar mensagens
                </p>
              </div>
              <Button 
                onClick={handleWhatsAppConnect} 
                disabled={isConnecting}
                size="lg"
                className="px-8"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Conectando...
                  </>
                ) : (
                  <>
                    <Smartphone className="h-5 w-5 mr-2" />
                    Conectar WhatsApp
                  </>
                )}
              </Button>
            </div>
          ) : (
            (() => {
              const inst = instances[0];
              
              return (
                <div className="border rounded-lg p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Smartphone className="h-6 w-6 text-muted-foreground" />
                      <div>
                        <h3 className="font-semibold text-lg">WhatsApp</h3>
                        <p className="text-xs text-muted-foreground">{inst.instance_name}</p>
                      </div>
                    </div>
                    <Badge 
                      variant={
                        inst.status === 'connected' ? 'default' : 
                        inst.status === 'connecting' ? 'secondary' : 
                        inst.status === 'error' ? 'destructive' : 
                        'outline'
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
                            type={visibleKeys[inst.id] ? "text" : "password"}
                            value={inst.instance_api_key}
                            readOnly
                            className="h-8 font-mono text-xs bg-muted pr-8"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-8 w-8"
                            onClick={() => toggleKeyVisibility(inst.id)}
                          >
                            {visibleKeys[inst.id] ? (
                              <EyeOff className="h-3 w-3" />
                            ) : (
                              <Eye className="h-3 w-3" />
                            )}
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

                  <div className="flex items-center gap-2 pt-2 border-t">
                    {inst.status === 'connected' && (() => {
                      const metadata = inst.metadata as any;
                      const phone = metadata?.connected_phone 
                        || (() => {
                          // Fallback: extrair de campos conhecidos
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
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleReconnect(inst.id)}
                        disabled={isReconnecting}
                        className="flex-1"
                      >
                        <QrCode className="h-4 w-4 mr-2" />
                        Conectar WhatsApp
                      </Button>
                    )}

                    {inst.status === 'connected' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => disconnectWhatsApp(inst.id)}
                        disabled={isDisconnecting}
                        className="flex-1"
                      >
                        <Smartphone className="h-4 w-4 mr-2" />
                        Desconectar
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => updateStatus(inst.id)}
                      disabled={isUpdating}
                      title="Atualizar Status"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteConfirm({ open: true, id: inst.id })}
                      disabled={isDeleting}
                      aria-label="Excluir Instância"
                    >
                      {isDeleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })()
          )}
        </CardContent>
      </Card>

      {/* QR Code Modal - IDÊNTICO ao CRM */}
      <Dialog open={isQrModalOpen} onOpenChange={setIsQrModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Conectar WhatsApp</DialogTitle>
            {selectedInstanceId && (
              <p className="text-sm text-muted-foreground">
                Instância: <span className="font-medium">
                  {instances?.find(i => i.id === selectedInstanceId)?.instance_name}
                </span>
              </p>
            )}
          </DialogHeader>
          
          <div className="space-y-6">
            {selectedInstanceId && instances?.find(i => i.id === selectedInstanceId)?.qr_code ? (
              <>
                <div className="flex items-center justify-center">
                  <div className="border-4 border-foreground rounded-lg p-4 bg-background">
                    <img 
                      src={instances.find(i => i.id === selectedInstanceId)!.qr_code!} 
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
                    <li className="flex gap-2">
                      <span className="font-medium">1.</span>
                      <span>Abra o WhatsApp no celular</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-medium">2.</span>
                      <span>Toque em <strong>Mais opções → Aparelhos conectados</strong></span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-medium">3.</span>
                      <span>Toque em <strong>Conectar um aparelho</strong></span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-medium">4.</span>
                      <span>Aponte o celular para esta tela</span>
                    </li>
                  </ol>
                </div>

                <Button 
                  variant="outline"
                  onClick={() => handleReconnect(selectedInstanceId)}
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
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ open, id: open ? deleteConfirm.id : null })}
        title="Excluir Instância WhatsApp"
        description="Tem certeza que deseja excluir permanentemente esta instância do WhatsApp? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={async () => {
          if (deleteConfirm.id) {
            await deleteWhatsApp(deleteConfirm.id);
            setDeleteConfirm({ open: false, id: null });
          }
        }}
      />
    </>
  );
}

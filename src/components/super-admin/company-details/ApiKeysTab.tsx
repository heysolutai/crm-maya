import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Key, Plus, Trash2, Copy, Eye, EyeOff, Power, PowerOff } from 'lucide-react';
import { useApiKeys } from '@/hooks/useApiKeys';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ApiKeysTabProps {
  companyId: string;
}

export function ApiKeysTab({ companyId }: ApiKeysTabProps) {
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);
  
  const { apiKeys, isLoading, createApiKey, deleteApiKey, toggleApiKeyStatus } = useApiKeys(companyId);

  const handleCreateApiKey = () => {
    if (!newKeyName.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Por favor, informe um nome para a API Key',
        variant: 'destructive',
      });
      return;
    }

    createApiKey(newKeyName, {
      onSuccess: () => {
        setNewKeyName('');
        setIsCreating(false);
      },
    });
  };

  const toggleShowKey = (keyId: string) => {
    setShowKeys(prev => ({ ...prev, [keyId]: !prev[keyId] }));
  };

  const copyToClipboard = (key: string) => {
    navigator.clipboard.writeText(key);
    toast({
      title: 'Copiado!',
      description: 'API Key copiada para a área de transferência',
    });
  };

  const maskApiKey = (key: string) => {
    if (key.length <= 12) return key;
    return `${key.substring(0, 8)}${'•'.repeat(32)}${key.substring(key.length - 4)}`;
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                API Keys de Autenticação
              </CardTitle>
              <CardDescription>
                Chaves para autenticar chamadas às edge functions e integrações externas (N8N, webhooks, etc)
              </CardDescription>
            </div>
            {!isCreating && (
              <Button onClick={() => setIsCreating(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Nova API Key
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {isCreating && (
            <Card className="mb-6 border-primary">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="keyName">Nome da API Key</Label>
                    <Input
                      id="keyName"
                      placeholder="Ex: N8N Production, Zapier Integration"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateApiKey();
                        if (e.key === 'Escape') {
                          setIsCreating(false);
                          setNewKeyName('');
                        }
                      }}
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleCreateApiKey}>
                      Criar API Key
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsCreating(false);
                        setNewKeyName('');
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {apiKeys && apiKeys.length === 0 ? (
            <div className="text-center py-12">
              <Key className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhuma API Key criada</h3>
              <p className="text-muted-foreground mb-4">
                Crie uma API Key para permitir integrações externas com esta empresa
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {apiKeys?.map((key) => (
                <Card key={key.id} className="border-border">
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-lg">{key.name}</h4>
                            <Badge variant={key.is_active ? 'default' : 'secondary'}>
                              {key.is_active ? 'Ativa' : 'Inativa'}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-2">
                            <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono break-all">
                              {showKeys[key.id] ? key.key : maskApiKey(key.key)}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleShowKey(key.id)}
                              title={showKeys[key.id] ? 'Ocultar' : 'Mostrar'}
                            >
                              {showKeys[key.id] ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => copyToClipboard(key.key)}
                              title="Copiar"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="text-xs text-muted-foreground space-y-1">
                            <div>Criada em: {formatDate(key.created_at!)}</div>
                            {key.last_used_at && (
                              <div>Último uso: {formatDate(key.last_used_at)}</div>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-2 ml-4">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => toggleApiKeyStatus({ keyId: key.id, isActive: key.is_active! })}
                            title={key.is_active ? 'Desativar' : 'Ativar'}
                          >
                            {key.is_active ? (
                              <PowerOff className="h-4 w-4" />
                            ) : (
                              <Power className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => setKeyToDelete(key.id)}
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!keyToDelete} onOpenChange={() => setKeyToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta API Key? Esta ação não pode ser desfeita e todas as
              integrações usando esta chave deixarão de funcionar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (keyToDelete) {
                  deleteApiKey(keyToDelete);
                  setKeyToDelete(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

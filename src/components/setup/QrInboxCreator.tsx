"use client";

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, QrCode } from 'lucide-react';
import { ServidorUazapiField, servidorUazapiValido } from '@/components/inboxes/ServidorUazapiField';
import { sendJson, withCompany } from './setup-api';

interface Props {
  companyId: string;
  defaultName: string;
  onCreated?: () => void;
}

/**
 * Cria a conexao QR Code (API Reservemaya / uazapi) do restaurante pelo
 * super-admin.
 *
 * O WhatsAppConfigCard so sabe reconectar/ler QR de uma conexao que ja existe
 * (o "Conectar" dele, sem conexao, e um no-op legado). Este card cobre o
 * primeiro passo: cria a inbox via POST /api/agents, que ja provisiona a
 * instancia e o agente de IA dedicado. Depois o QR e lido no proprio
 * WhatsAppConfigCard.
 */
export function QrInboxCreator({ companyId, defaultName, onCreated }: Props) {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(defaultName);
  const [useExisting, setUseExisting] = useState(false);
  const [instanceToken, setInstanceToken] = useState('');
  const [instanceServer, setInstanceServer] = useState('');
  const [restaurantId, setRestaurantId] = useState('');
  const [creating, setCreating] = useState(false);

  const canCreate =
    displayName.trim().length > 0 &&
    (!useExisting || (instanceToken.trim().length > 0 && servidorUazapiValido(instanceServer)));

  const handleCreate = async () => {
    if (!canCreate) return;
    setCreating(true);
    try {
      await sendJson(
        withCompany('/api/agents', companyId),
        'POST',
        {
          channelType: 'uazapi',
          displayName: displayName.trim(),
          mode: useExisting ? 'existing' : 'create',
          instanceToken: useExisting ? instanceToken.trim() : undefined,
          serverUrl: useExisting ? instanceServer.trim().replace(/\/+$/, '') : undefined,
          restaurantId: restaurantId.trim() || undefined,
        },
        'Erro ao criar a conexão'
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['whatsapp-instances', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['inboxes'] }),
        queryClient.invalidateQueries({ queryKey: ['setup-checklist', companyId] }),
      ]);
      toast.success('Conexão criada', {
        description: 'Agora clique em "Conectar WhatsApp" para ler o QR Code.',
      });
      onCreated?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <QrCode className="h-5 w-5" />
          Nova conexão por QR Code
        </CardTitle>
        <CardDescription>
          Cria a instância na API Reservemaya e o agente de IA da conexão.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="qr-display-name">Nome da conexão</Label>
          <Input
            id="qr-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Ex: Cantina da Nonna - Centro"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="qr-restaurant-id">ID do restaurante na Reserve Maya (opcional)</Label>
          <Input
            id="qr-restaurant-id"
            value={restaurantId}
            onChange={(e) => setRestaurantId(e.target.value)}
            placeholder="Pode preencher depois, logo abaixo"
          />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Já tenho uma instância</p>
            <p className="text-xs text-muted-foreground">
              Reaproveita uma instância existente colando o token dela (migração).
            </p>
          </div>
          <Switch checked={useExisting} onCheckedChange={setUseExisting} />
        </div>

        {useExisting && (
          <>
            <ServidorUazapiField
              id="qr-instance-server"
              value={instanceServer}
              onChange={setInstanceServer}
              companyId={companyId}
            />
            <div className="space-y-2">
              <Label htmlFor="qr-instance-token">Token da instância</Label>
              <Input
                id="qr-instance-token"
                value={instanceToken}
                onChange={(e) => setInstanceToken(e.target.value)}
                placeholder="Token da instância existente"
                autoComplete="off"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              A IA desta conexão começa desligada: as conversas chegam, mas ninguém recebe resposta até ligar.
            </p>
          </>
        )}

        <Button className="w-full" onClick={handleCreate} disabled={!canCreate || creating}>
          {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCode className="h-4 w-4 mr-2" />}
          Criar conexão
        </Button>
      </CardContent>
    </Card>
  );
}

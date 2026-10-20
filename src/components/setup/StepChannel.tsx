"use client";

import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CloudCog, Hash, Loader2, QrCode, RefreshCw } from 'lucide-react';
import { WhatsAppConfigCard } from '@/components/super-admin/company-details/WhatsAppConfigCard';
import { WhatsAppCloudCard } from '@/components/super-admin/company-details/WhatsAppCloudCard';
import { QrInboxCreator } from './QrInboxCreator';
import { sendJson, withCompany, type SetupStepHandle } from './setup-api';
import type { SetupStatus } from './setup-status';

interface Props {
  companyId: string;
  companyName: string;
  status: SetupStatus | null;
  isFetching: boolean;
  onRefresh: () => void;
}

const CLOUD_CHANNEL = 'whatsapp_cloud';

function channelLabel(channelType: string): string {
  if (channelType === CLOUD_CHANNEL) return 'WhatsApp Cloud';
  if (channelType === 'uazapi') return 'QR Code';
  return channelType;
}

/**
 * Passo "Canal WhatsApp": QR Code ou WhatsApp Cloud lado a lado e, embaixo,
 * o ID do restaurante na Reserve Maya de cada conexao (channelConfig.restaurantId,
 * gravado via PUT /api/agents).
 */
export const StepChannel = forwardRef<SetupStepHandle, Props>(function StepChannel(
  { companyId, companyName, status, isFetching, onRefresh },
  ref
) {
  const queryClient = useQueryClient();
  // So o que o usuario editou: o valor exibido cai no do servidor quando nao ha rascunho.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const inboxes = useMemo(() => status?.inboxes ?? [], [status]);
  const hasQrInbox = inboxes.some((i) => i.channelType !== CLOUD_CHANNEL);

  useImperativeHandle(
    ref,
    () => ({
      save: async () => {
        const changed = inboxes.filter((inbox) => {
          const draft = drafts[inbox.id];
          return draft !== undefined && draft.trim() !== (inbox.restaurantId ?? '');
        });
        if (changed.length === 0) return true;

        const results = await Promise.allSettled(
          changed.map((inbox) =>
            sendJson(
              withCompany('/api/agents', companyId),
              'PUT',
              { id: inbox.id, restaurantId: drafts[inbox.id].trim() },
              `Erro ao salvar o ID do restaurante em ${inbox.name}`
            )
          )
        );
        const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['setup-checklist', companyId] }),
          queryClient.invalidateQueries({ queryKey: ['whatsapp-instances', companyId] }),
          queryClient.invalidateQueries({ queryKey: ['inboxes'] }),
        ]);

        if (failed.length > 0) {
          toast.error((failed[0].reason as Error).message);
          return false;
        }
        setDrafts({});
        toast.success(changed.length === 1 ? 'ID do restaurante salvo' : 'IDs do restaurante salvos');
        return true;
      },
    }),
    [inboxes, drafts, companyId, queryClient]
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <QrCode className="h-4 w-4 text-primary" />
            QR Code
          </p>
          <p className="text-xs text-muted-foreground">
            Conecta o WhatsApp do restaurante lendo o QR Code no celular.
          </p>
          {hasQrInbox ? (
            <WhatsAppConfigCard companyId={companyId} />
          ) : (
            <QrInboxCreator companyId={companyId} defaultName={companyName} onCreated={onRefresh} />
          )}
        </div>

        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <CloudCog className="h-4 w-4 text-primary" />
            WhatsApp Cloud (API oficial)
          </p>
          <p className="text-xs text-muted-foreground">
            Número oficial da Meta, sem depender de celular conectado.
          </p>
          <WhatsAppCloudCard companyId={companyId} />
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <Hash className="h-4 w-4 text-primary" />
              ID do restaurante na Reserve Maya
            </CardTitle>
            <CardDescription>
              Usado nas reservas e no disparo das avaliações. Cada conexão precisa do seu.
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onRefresh} disabled={isFetching} title="Atualizar conexões">
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {inboxes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma conexão ainda. Crie uma acima (QR Code ou WhatsApp Cloud) e ela aparece aqui.
            </p>
          ) : (
            inboxes.map((inbox) => (
              <div key={inbox.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Label htmlFor={`restaurant-id-${inbox.id}`} className="font-medium">
                    {inbox.name}
                  </Label>
                  <Badge variant="outline" className="text-[10px]">
                    {channelLabel(inbox.channelType)}
                  </Badge>
                  <Badge variant={inbox.connected ? 'default' : 'secondary'} className="text-[10px]">
                    {inbox.connected ? 'Conectado' : 'Desconectado'}
                  </Badge>
                  {!inbox.isActive && (
                    <Badge variant="secondary" className="text-[10px]">
                      Inativa
                    </Badge>
                  )}
                </div>
                <Input
                  id={`restaurant-id-${inbox.id}`}
                  value={drafts[inbox.id] ?? inbox.restaurantId ?? ''}
                  onChange={(e) => setDrafts((p) => ({ ...p, [inbox.id]: e.target.value }))}
                  placeholder="Ex: 1234"
                  maxLength={120}
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
});

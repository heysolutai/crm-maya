"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api/client";
import { WhatsAppCloudConnect } from "@/components/inboxes/WhatsAppCloudConnect";

/**
 * Cadastro de numero WhatsApp Cloud (API oficial) pelo super-admin.
 *
 * Dois caminhos: (1) o restaurante conecta pelo pop-up da Meta / link
 * enviado (WhatsAppCloudConnect, sub-conta SaaS da Covercut); (2) cadastro
 * manual de um numero ja conectado no painel da Covercut, so super-admin.
 */

interface WhatsAppCloudCardProps {
  companyId: string;
}

interface CloudNumber {
  phoneNumberId: string;
  displayPhoneNumber: string;
  status: string | null;
  qualityRating: string | null;
  inUse: boolean;
  companyId: string | null;
  companyName: string | null;
}

interface NumbersResponse {
  configured: boolean;
  numbers: CloudNumber[];
  error?: string;
}

interface InboxRow {
  id: string;
  channel_type: string;
  display_name: string;
  phone_number: string | null;
  status: string | null;
  error_message: string | null;
  restaurant_id: string | null;
  channel_config: Record<string, unknown> | null;
}

const MANUAL = "__manual__";

function formatPhone(digits: string | null): string {
  if (!digits) return "";
  const d = digits.replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return `+${d}`;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

export function WhatsAppCloudCard({ companyId }: WhatsAppCloudCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<string>("");
  const [manualId, setManualId] = useState("");
  const [displayName, setDisplayName] = useState("WhatsApp Oficial");
  const [restaurantId, setRestaurantId] = useState("");
  const [removeId, setRemoveId] = useState<string | null>(null);

  const numbersQuery = useQuery({
    queryKey: ["whatsapp-cloud-numbers"],
    queryFn: async (): Promise<NumbersResponse> => {
      const res = await apiFetch("/api/admin/whatsapp-cloud/numbers");
      const data = (await res.json()) as NumbersResponse;
      if (!res.ok && !data.numbers) throw new Error(data.error || "Falha ao listar números");
      return data;
    },
  });

  const inboxesQuery = useQuery({
    queryKey: ["whatsapp-instances", companyId, "cloud"],
    queryFn: async (): Promise<InboxRow[]> => {
      const res = await apiFetch(`/api/agents?companyId=${companyId}`);
      if (!res.ok) throw new Error("Falha ao carregar caixas");
      const data = (await res.json()) as InboxRow[];
      return data.filter((i) => i.channel_type === "whatsapp_cloud");
    },
    enabled: !!companyId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["whatsapp-instances", companyId] });
    queryClient.invalidateQueries({ queryKey: ["whatsapp-cloud-numbers"] });
    queryClient.invalidateQueries({ queryKey: ["inboxes"] });
    queryClient.invalidateQueries({ queryKey: ["setup-checklist", companyId] });
  };

  const phoneNumberId = selected === MANUAL ? manualId.replace(/\D/g, "") : selected;

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/agents?companyId=${companyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelType: "whatsapp_cloud",
          displayName: displayName.trim() || "WhatsApp Oficial",
          extra: { phoneNumberId },
          ...(restaurantId.trim() ? { restaurantId: restaurantId.trim() } : {}),
        }),
      });
      if (!res.ok) throw new Error(await readError(res, "Falha ao conectar número"));
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Número conectado", description: "Recebimento configurado. Já pode receber mensagens." });
      setSelected("");
      setManualId("");
      setRestaurantId("");
      invalidate();
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao conectar", description: error.message, variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (inboxId: string) => {
      const res = await apiFetch(`/api/agents/${inboxId}/status?companyId=${companyId}`);
      if (!res.ok) throw new Error(await readError(res, "Falha ao verificar status"));
      return res.json();
    },
    onSuccess: () => invalidate(),
    onError: (error: Error) => {
      toast({ title: "Erro ao verificar", description: error.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (inboxId: string) => {
      const res = await apiFetch(`/api/agents?id=${inboxId}&companyId=${companyId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res, "Falha ao remover"));
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Número removido desta empresa" });
      setRemoveId(null);
      invalidate();
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
    },
  });

  const numbers = numbersQuery.data?.numbers ?? [];
  const available = numbers.filter((n) => !n.inUse);
  const notConfigured = numbersQuery.data && !numbersQuery.data.configured;
  const canSubmit = phoneNumberId.length >= 6 && !createMutation.isPending;
  const inboxes = inboxesQuery.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BadgeCheck className="h-5 w-5 text-emerald-600" />
          WhatsApp Cloud (API oficial)
        </CardTitle>
        <CardDescription>
          Número verificado pela Meta, sem QR Code. O recebimento de mensagens é configurado automaticamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {inboxes.length > 0 && (
          <div className="space-y-2">
            {inboxes.map((inbox) => {
              const connected = inbox.status === "connected";
              return (
                <div
                  key={inbox.id}
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{inbox.display_name}</span>
                      <Badge variant={connected ? "default" : "destructive"}>
                        {connected ? "Conectado" : "Desconectado"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatPhone(inbox.phone_number)}
                      {inbox.restaurant_id ? ` · Reserve Maya: ${inbox.restaurant_id}` : ""}
                    </p>
                    {!connected && inbox.error_message && (
                      <p className="text-xs text-destructive">{inbox.error_message}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => statusMutation.mutate(inbox.id)}
                      disabled={statusMutation.isPending}
                    >
                      {statusMutation.isPending && statusMutation.variables === inbox.id ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-1 h-4 w-4" />
                      )}
                      Status
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setRemoveId(inbox.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {notConfigured ? (
          <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            WhatsApp Cloud não configurado no servidor. Defina COVERCUT_API_KEY e COVERCUT_API_SECRET no ambiente.
          </p>
        ) : (
          <>
          <div className="space-y-2 rounded-lg border p-4">
            <p className="text-sm font-medium">Conexão pelo restaurante</p>
            <p className="text-xs text-muted-foreground">
              Quem administra o Facebook do restaurante conecta o número na janela da Meta. Se não for você, use
              &quot;Copiar link de conexão&quot; e envie para a pessoa responsável: a caixa de entrada aparece aqui sozinha quando a conexão for concluída.
            </p>
            <WhatsAppCloudConnect companyId={companyId} onConnected={invalidate} />
          </div>
          <div className="space-y-4 rounded-lg border border-dashed p-4">
            <p className="text-sm font-medium">Ou cadastre um número já conectado no painel</p>
            <div className="space-y-2">
              <Label>Número</Label>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={numbersQuery.isLoading ? "Carregando números..." : "Escolha o número conectado"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {available.map((n) => (
                    <SelectItem key={n.phoneNumberId} value={n.phoneNumberId}>
                      {n.displayPhoneNumber}
                      {n.qualityRating ? ` · qualidade ${n.qualityRating}` : ""}
                    </SelectItem>
                  ))}
                  <SelectItem value={MANUAL}>Informar Phone Number ID manualmente</SelectItem>
                </SelectContent>
              </Select>
              {numbersQuery.data?.error && (
                <p className="text-xs text-destructive">{numbersQuery.data.error}</p>
              )}
              {numbers.some((n) => n.inUse) && (
                <p className="text-xs text-muted-foreground">
                  Já em uso:{" "}
                  {numbers
                    .filter((n) => n.inUse)
                    .map((n) => `${n.displayPhoneNumber} (${n.companyName ?? "outra empresa"})`)
                    .join(", ")}
                </p>
              )}
            </div>

            {selected === MANUAL && (
              <div className="space-y-2">
                <Label htmlFor="cloud-phone-id">Phone Number ID</Label>
                <Input
                  id="cloud-phone-id"
                  inputMode="numeric"
                  placeholder="123456789012345"
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cloud-display-name">Nome da caixa</Label>
                <Input
                  id="cloud-display-name"
                  value={displayName}
                  maxLength={255}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cloud-restaurant-id">ID na Reserve Maya (opcional)</Label>
                <Input
                  id="cloud-restaurant-id"
                  value={restaurantId}
                  maxLength={120}
                  onChange={(e) => setRestaurantId(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => createMutation.mutate()} disabled={!canSubmit}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Conectar número
              </Button>
            </div>
          </div>
          </>
        )}
      </CardContent>

      <ConfirmDialog
        open={removeId !== null}
        onOpenChange={(open) => !open && setRemoveId(null)}
        title="Remover número desta empresa?"
        description="O número continua conectado na Meta; só deixa de receber mensagens aqui. As conversas são mantidas."
        confirmLabel="Remover"
        variant="destructive"
        isLoading={removeMutation.isPending}
        onConfirm={() => {
          if (removeId) removeMutation.mutate(removeId);
        }}
      />
    </Card>
  );
}

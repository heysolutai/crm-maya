"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Copy, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";

/**
 * Botao "Conectar WhatsApp oficial" (WhatsApp Cloud) pro admin do restaurante.
 *
 * Abre o pop-up de conexao da Meta (link white-label da Covercut). Quando a
 * janela avisa WA_CONNECT_SUCCESS, chama o sync, que cria a caixa de entrada
 * do numero ja com o webhook configurado. Se a janela fechar sem aviso, roda o
 * sync do mesmo jeito (o webhook de servidor tambem cobre esse caso).
 */

interface Props {
  /** Super-admin fora da personificacao: empresa alvo explicita. */
  companyId?: string;
  onConnected?: (createdInboxIds: string[]) => void;
}

interface ConnectLink {
  url: string;
  origin: string;
}

interface SyncResponse {
  created: { inboxId: string; phone: string }[];
  alreadyLinked: number;
  conflicts: number;
  failed: { phone: string; error: string }[];
  error?: string;
}

interface ConnectMessage {
  type?: string;
  message?: string;
}

export function WhatsAppCloudConnect({ companyId, onConnected }: Props) {
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [copying, setCopying] = useState(false);
  const originRef = useRef<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";

  const sync = useCallback(
    async (quietWhenEmpty = false) => {
      setSyncing(true);
      try {
        const res = await apiFetch(`/api/whatsapp-cloud/sync${qs}`, { method: "POST" });
        const data = (await res.json()) as SyncResponse;
        if (!res.ok) throw new Error(data.error || "Falha ao atualizar conexão");

        if (data.created.length > 0) {
          toast.success(`WhatsApp conectado: ${data.created.map((c) => c.phone).join(", ")}`);
        } else if (data.failed.length > 0) {
          toast.error(`Não foi possível ativar o número: ${data.failed[0].error}`);
        } else if (data.conflicts > 0) {
          toast.error("Este número já está vinculado a outra conta. Fale com o suporte.");
        } else if (!quietWhenEmpty) {
          toast.info(
            data.alreadyLinked > 0
              ? "Seu número já está conectado."
              : "Nenhum número conectado ainda. Conclua a conexão na janela da Meta."
          );
        }

        queryClient.invalidateQueries({ queryKey: ["inboxes"] });
        if (companyId) {
          queryClient.invalidateQueries({ queryKey: ["whatsapp-instances", companyId] });
          queryClient.invalidateQueries({ queryKey: ["setup-checklist", companyId] });
        }
        if (data.created.length > 0) onConnected?.(data.created.map((c) => c.inboxId));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Erro ao atualizar conexão");
      } finally {
        setSyncing(false);
      }
    },
    [qs, companyId, queryClient, onConnected]
  );

  // Retorno do pop-up: so aceita mensagem vinda da origem do link (Covercut).
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!originRef.current || event.origin !== originRef.current) return;
      const data = event.data as ConnectMessage | null;
      if (!data || typeof data !== "object") return;

      if (data.type === "WA_CONNECT_SUCCESS") {
        setConnecting(false);
        void sync();
      } else if (data.type === "WA_CONNECT_CLOSED") {
        setConnecting(false);
        toast.info("A janela foi fechada antes de concluir a conexão.");
      } else if (data.type === "WA_CONNECT_ERROR") {
        setConnecting(false);
        toast.error(`Não foi possível concluir a conexão: ${data.message || "erro desconhecido"}`);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [sync]);

  // Janela fechada sem aviso nenhum: sai do "aguardando" e confere em silencio.
  useEffect(() => {
    if (!connecting) return;
    const timer = window.setInterval(() => {
      if (popupRef.current?.closed) {
        window.clearInterval(timer);
        setConnecting(false);
        void sync(true);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [connecting, sync]);

  const fetchLink = async (): Promise<ConnectLink> => {
    const res = await apiFetch(`/api/whatsapp-cloud/connect-link${qs}`, { method: "POST" });
    const data = (await res.json()) as Partial<ConnectLink> & { error?: string };
    if (!res.ok || !data.url || !data.origin) throw new Error(data.error || "Falha ao gerar link de conexão");
    return { url: data.url, origin: data.origin };
  };

  const handleConnect = async () => {
    // A janela abre JA no clique (antes do await): aberta depois de uma
    // chamada assincrona, o bloqueador de pop-up do navegador barra.
    const w = 550;
    const h = 700;
    const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
    const popup = window.open("", "ConnectWhatsApp", `width=${w},height=${h},left=${left},top=${top}`);
    if (!popup) {
      toast.error("Não foi possível abrir a janela de conexão. Desative o bloqueador de pop-up.");
      return;
    }
    popupRef.current = popup;
    setConnecting(true);
    try {
      const link = await fetchLink();
      originRef.current = link.origin;
      popup.location.href = link.url;
    } catch (error) {
      popup.close();
      setConnecting(false);
      toast.error(error instanceof Error ? error.message : "Erro ao gerar link de conexão");
    }
  };

  const handleCopy = async () => {
    setCopying(true);
    try {
      const link = await fetchLink();
      originRef.current = link.origin;
      await navigator.clipboard.writeText(link.url);
      toast.success("Link copiado. Envie para quem administra o Facebook do restaurante.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao copiar link");
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button onClick={handleConnect} disabled={connecting || syncing} className="w-full sm:w-auto">
        {connecting || syncing ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <BadgeCheck className="mr-2 h-4 w-4" />
        )}
        {connecting ? "Aguardando conexão..." : syncing ? "Ativando número..." : "Conectar WhatsApp oficial"}
      </Button>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={handleCopy} disabled={copying}>
          {copying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
          Copiar link de conexão
        </Button>
        <Button variant="outline" size="sm" onClick={() => void sync()} disabled={syncing || connecting}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Já conectei, atualizar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Você entra com o Facebook da empresa e escolhe o número. É preciso ser administrador do Gerenciador de
        Negócios (Business Manager) do restaurante. O recebimento de mensagens é configurado automaticamente.
      </p>
    </div>
  );
}

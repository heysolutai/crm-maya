import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/api/auth";
import { handleApiError } from '@/lib/api/errors'

/**
 * Proxy para endpoints de catálogo WhatsApp Business da UazAPI.
 * Busca a instância ativa da empresa e encaminha as requisições.
 *
 * Endpoints suportados via ?action=:
 *   - list: listar produtos
 *   - info: obter info de um produto (requer productId)
 *   - show: mostrar produto (requer productId)
 *   - hide: ocultar produto (requer productId)
 *   - delete: deletar produto (requer productId)
 */

async function getInstance(companyId: string) {
  const instance = await prisma.whatsappInstance.findFirst({
    where: { companyId, isActive: true },
    select: { id: true, apiUrl: true, instanceApiKey: true, instanceName: true, metadata: true, status: true },
  });

  if (!instance) return { error: "Instância do WhatsApp não encontrada" };
  if (!instance.apiUrl || !instance.instanceApiKey) {
    return { error: "Instância não configurada corretamente (faltam apiUrl ou token)" };
  }

  // Verificar status em tempo real na UazAPI (não confiar no banco que pode estar desatualizado)
  try {
    const statusRes = await fetch(`${instance.apiUrl}/instance/status`, {
      method: "GET",
      headers: { "Accept": "application/json", "token": instance.instanceApiKey },
    });

    if (statusRes.ok) {
      const statusData = await statusRes.json();
      const hasStatusObj = typeof statusData.status === "object" && statusData.status !== null;
      const isConnected = hasStatusObj
        ? (statusData.status?.connected === true || statusData.status?.loggedIn === true)
        : (statusData.instance?.status === "connected" || statusData.instance?.status === "open");

      // Remove device suffix (:35) → "556291873663:35@s.whatsapp.net" → "556291873663@s.whatsapp.net"
      const cleanJid = (raw: string) => raw.replace(/:(\d+)@/, "@");

      const rawJid = hasStatusObj
        ? (statusData.status?.jid as string) || ""
        : (statusData.instance?.owner as string) || "";
      const ownerJid = rawJid ? cleanJid(rawJid) : "";

      console.log(`[Catalog] Instância "${instance.instanceName}" liveStatus connected=${isConnected} jid=${ownerJid}`);

      if (!isConnected) {
        const rawStatus = hasStatusObj ? JSON.stringify(statusData.status) : statusData.instance?.status;
        return { error: `WhatsApp não está conectado. Status atual: ${rawStatus || 'desconhecido'}` };
      }

      // Atualizar banco como efeito colateral (sem bloquear)
      prisma.whatsappInstance.update({
        where: { id: instance.id },
        data: { status: "connected" },
      }).catch(() => {});

      return {
        apiUrl: instance.apiUrl,
        token: instance.instanceApiKey,
        jid: ownerJid,
      };
    }
  } catch (e) {
    console.error(`[Catalog] Erro ao verificar status live da instância:`, e);
    // Se não conseguiu checar ao vivo, cai no status do banco como fallback
  }

  // Fallback: usar status do banco
  const CONNECTED_STATES = ["connected", "open", "online", "inchat"];
  const isDbConnected = CONNECTED_STATES.some(s => s === (instance.status || "").toLowerCase());
  if (!isDbConnected) {
    return { error: `WhatsApp não está conectado (status no banco: "${instance.status || 'desconhecido'}"). Clique em "Atualizar" nas configurações.` };
  }

  const metadata = (instance.metadata || {}) as Record<string, unknown>;
  const ownerJid = (metadata.owner as string) || (metadata.wid as string) || "";

  return {
    apiUrl: instance.apiUrl,
    token: instance.instanceApiKey,
    jid: ownerJid,
  };
}

async function callUazapi(apiUrl: string, path: string, token: string, body?: Record<string, unknown>, method: "GET" | "POST" = "POST") {
  const url = `${apiUrl.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      token,
    },
    body: method === "POST" && body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function POST(req: NextRequest) {
  const { companyId } = await authenticate(req);
  if (!companyId) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 403 });
  }

  try {
    const url = req.nextUrl;
    const action = url.searchParams.get("action") || "list";

    const instance = await getInstance(companyId);
    if ("error" in instance) {
      return NextResponse.json({ error: instance.error }, { status: 503 });
    }

    const { apiUrl, token, jid } = instance;

    const body = await req.json().catch(() => ({}));
    const productId = body.productId || body.id;

    switch (action) {
      case "list": {
        const listBody: Record<string, unknown> = {};
        if (jid) listBody.jid = jid;
        const result = await callUazapi(apiUrl, "/business/catalog/list", token, listBody);
        console.log("[Catalog] UazAPI response ok:", result.ok, "status:", result.status);
        console.log("[Catalog] UazAPI catalog data:", JSON.stringify(result.data).substring(0, 500));
        if (!result.ok) {
          console.error("[Catalog] Erro ao listar catálogo:", JSON.stringify(result.data));
          return NextResponse.json(
            { error: "Erro ao listar catálogo", details: result.data },
            { status: result.status }
          );
        }
        return NextResponse.json({ data: result.data });
      }

      case "info": {
        if (!productId) {
          return NextResponse.json({ error: "productId obrigatório" }, { status: 400 });
        }
        const result = await callUazapi(apiUrl, "/business/catalog/info", token, { jid, id: productId });
        if (!result.ok) {
          return NextResponse.json(
            { error: "Erro ao buscar produto", details: result.data },
            { status: result.status }
          );
        }
        return NextResponse.json({ data: result.data });
      }

      case "show": {
        if (!productId) {
          return NextResponse.json({ error: "productId obrigatório" }, { status: 400 });
        }
        const result = await callUazapi(apiUrl, "/business/catalog/show", token, { id: productId });
        if (!result.ok) {
          return NextResponse.json(
            { error: "Erro ao mostrar produto", details: result.data },
            { status: result.status }
          );
        }
        return NextResponse.json({ success: true, data: result.data });
      }

      case "hide": {
        if (!productId) {
          return NextResponse.json({ error: "productId obrigatório" }, { status: 400 });
        }
        const result = await callUazapi(apiUrl, "/business/catalog/hide", token, { id: productId });
        if (!result.ok) {
          return NextResponse.json(
            { error: "Erro ao ocultar produto", details: result.data },
            { status: result.status }
          );
        }
        return NextResponse.json({ success: true, data: result.data });
      }

      case "delete": {
        if (!productId) {
          return NextResponse.json({ error: "productId obrigatório" }, { status: 400 });
        }
        const result = await callUazapi(apiUrl, "/business/catalog/delete", token, { id: productId });
        if (!result.ok) {
          return NextResponse.json(
            { error: "Erro ao deletar produto", details: result.data },
            { status: result.status }
          );
        }
        return NextResponse.json({ success: true, data: result.data });
      }

      default:
        return NextResponse.json({ error: `Ação inválida: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return handleApiError(error, 'Erro no catálogo WhatsApp')
  }
}

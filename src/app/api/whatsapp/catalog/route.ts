import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/api/auth";

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
    select: { apiUrl: true, instanceApiKey: true, metadata: true, status: true },
  });

  if (!instance) return { error: "Instância do WhatsApp não encontrada" };
  if (!instance.apiUrl || !instance.instanceApiKey) {
    return { error: "Instância não configurada corretamente" };
  }
  if (!instance.status || instance.status.toLowerCase() !== "connected") {
    return { error: `WhatsApp não está conectado (status: ${instance.status || 'desconhecido'})` };
  }

  // Extract phone from metadata (owner JID)
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
      return NextResponse.json({ error: instance.error }, { status: 400 });
    }

    const { apiUrl, token, jid } = instance;

    const body = await req.json().catch(() => ({}));
    const productId = body.productId || body.id;

    switch (action) {
      case "list": {
        // Try with jid first; if empty, try without it
        const listBody: Record<string, unknown> = {};
        if (jid) listBody.jid = jid;
        const result = await callUazapi(apiUrl, "/business/catalog/list", token, listBody);
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
    console.error("Erro no catálogo WhatsApp:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

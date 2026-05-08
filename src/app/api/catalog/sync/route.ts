import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/api/auth";

// POST /api/catalog/sync — importa todos os produtos da UazAPI e salva no banco
export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.companyId) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 403 });
  }

  try {
    const instance = await prisma.whatsappInstance.findFirst({
      where: { companyId: auth.companyId, isActive: true },
      select: { id: true, apiUrl: true, instanceApiKey: true, instanceName: true, metadata: true },
    });

    if (!instance) {
      return NextResponse.json({ error: "Instância do WhatsApp não encontrada" }, { status: 503 });
    }
    if (!instance.apiUrl || !instance.instanceApiKey) {
      return NextResponse.json({ error: "Instância não configurada corretamente" }, { status: 503 });
    }

    const apiUrl = instance.apiUrl;
    const token = instance.instanceApiKey;
    const instanceMeta = (instance.metadata as Record<string, unknown>) || {};
    const catalogBusinessId = (instanceMeta.catalogBusinessId as string) || "";

    // 1. Buscar JID da instância
    let jid = "";
    try {
      const statusRes = await fetch(`${apiUrl}/instance/status`, {
        method: "GET",
        headers: { Accept: "application/json", token },
      });
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        const cleanJid = (raw: string) => raw.replace(/:(\d+)@/, "@");
        const hasStatusObj = typeof statusData.status === "object" && statusData.status !== null;
        const rawJid = hasStatusObj
          ? (statusData.status?.jid as string) || ""
          : (statusData.instance?.owner as string) || "";
        jid = rawJid ? cleanJid(rawJid) : "";
      }
    } catch {
      // Tenta sem JID
    }
    // Extrai o número do JID (sem @s.whatsapp.net) — usado para montar o link do produto
    const jidPhone = jid ? jid.split("@")[0] : "";
    // Prioriza o JID. Se não tiver, usa o catalogBusinessId configurado manualmente
    const catalogLinkId = jidPhone || catalogBusinessId;
    console.log("[Catalog Sync] JID:", jid, "| jidPhone:", jidPhone, "| linkId final:", catalogLinkId);

    // 2. Buscar todos os produtos — tenta diferentes estratégias de paginação
    const allRawProducts = await fetchAllProducts(apiUrl, token, jid);
    console.log("[Catalog Sync] Total de produtos obtidos:", allRawProducts.length);

    if (allRawProducts.length === 0) {
      // Safeguard: se o WhatsApp retornou 0 produtos, NAO apagamos nada do
      // banco — provavelmente e erro transiente do provider e nao um catalogo
      // realmente vazio. O usuario pode forcar a remocao deletando manualmente.
      return NextResponse.json({
        success: true,
        synced: 0,
        deleted: 0,
        skipped_delete_reason: "empty_response",
        message: "Nenhum produto retornado pela UazAPI — nada foi alterado.",
      });
    }

    // 3. Salvar no banco (o /list já retorna tudo que precisamos)
    let synced = 0;
    const seenWaProductIds: string[] = [];
    for (const raw of allRawProducts) {
      const waProductId =
        (raw.ID as string) || (raw.id as string) || (raw.productId as string) || "";
      if (!waProductId) continue;
      seenWaProductIds.push(waProductId);

      const price = raw.Price as Record<string, string> | undefined;
      const images = raw.Images as Array<Record<string, unknown>> | undefined;

      let formattedPrice: string | undefined;
      if (price?.Amount) {
        const amount = parseFloat(price.Amount) / 1000;
        formattedPrice = amount.toLocaleString("pt-BR", {
          style: "currency",
          currency: price.Currency || "BRL",
        });
      }

      const imageList = (images ?? [])
        .map((img) => ({
          id: (img.ID as string) || "",
          originalUrl:
            (img.OriginalImageUrl as string) || (img.RequestImageUrl as string) || "",
          thumbUrl: (img.RequestImageUrl as string) || "",
        }))
        .filter((img) => img.originalUrl);

      const name = (raw.Name as string) || (raw.name as string) || "Sem nome";
      const description = (raw.Description as string) || (raw.description as string) || null;

      // Link do produto no catálogo: wa.me/p/{waProductId}/{numeroDoJid}
      const rawUrl = (raw.Url as string) || (raw.url as string) || "";
      const productUrl = catalogLinkId
        ? `https://wa.me/p/${waProductId}/${catalogLinkId}`
        : (rawUrl || null);

      await prisma.catalogProduct.upsert({
        where: {
          companyId_waProductId: { companyId: auth.companyId, waProductId },
        },
        create: {
          companyId: auth.companyId,
          instanceId: instance.id,
          waProductId,
          name,
          description,
          price: formattedPrice || null,
          priceAmount: price?.Amount || null,
          currency: price?.Currency || "BRL",
          availability: (raw.Availability as string) || null,
          isHidden: (raw.IsHidden as boolean) ?? false,
          retailerId: (raw.RetailerID as string) || null,
          url: productUrl,
          images: imageList as any,
          rawData: Prisma.DbNull,
          // attributes começa vazio; populado externamente (ex: n8n)
          attributes: {},
          syncedAt: new Date(),
        },
        // No update NÃO mexemos em `attributes` — preserva o que o n8n já populou
        update: {
          instanceId: instance.id,
          name,
          description,
          price: formattedPrice || null,
          priceAmount: price?.Amount || null,
          currency: price?.Currency || "BRL",
          availability: (raw.Availability as string) || null,
          isHidden: (raw.IsHidden as boolean) ?? false,
          retailerId: (raw.RetailerID as string) || null,
          url: productUrl,
          images: imageList as any,
          rawData: Prisma.DbNull,
          syncedAt: new Date(),
        },
      });
      synced++;
    }

    // 4. Remover do banco produtos que sumiram do WhatsApp.
    //    "WhatsApp e a fonte da verdade": tudo que esta no DB mas nao veio
    //    no list atual da UazAPI e considerado removido.
    const deleteResult = await prisma.catalogProduct.deleteMany({
      where: {
        companyId: auth.companyId,
        waProductId: { notIn: seenWaProductIds },
      },
    });
    const deleted = deleteResult.count;

    console.log(`[Catalog Sync] Synced=${synced}, Deleted=${deleted}, Total WA=${allRawProducts.length}`);

    return NextResponse.json({
      success: true,
      synced,
      deleted,
      total: allRawProducts.length,
    });
  } catch (error) {
    // Log detalhado no servidor
    console.error("[POST /api/catalog/sync] Erro completo:", error);
    if (error instanceof Error) {
      console.error("[POST /api/catalog/sync] Message:", error.message);
      console.error("[POST /api/catalog/sync] Stack:", error.stack);
    }

    // Detecta erros comuns do Prisma e retorna mensagem útil (sem vazar dados internos)
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("Unknown argument") || msg.includes("does not exist")) {
      return NextResponse.json(
        {
          error: "Banco de dados desatualizado. Rode 'prisma db push' no servidor para aplicar as novas colunas.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

// Busca todos os produtos paginando com cursor (paging.after)
async function fetchAllProducts(
  apiUrl: string,
  token: string,
  jid: string
): Promise<Record<string, unknown>[]> {
  const seen = new Set<string>();
  const all: Record<string, unknown>[] = [];
  let cursor: string | undefined = undefined;
  let page = 0;
  const MAX_PAGES = 100;

  do {
    page++;
    const body: Record<string, unknown> = {};
    if (jid) body.jid = jid;
    if (cursor) body.after = cursor;

    console.log(
      `[Catalog Sync] Página ${page} | body:`,
      JSON.stringify({ ...body, after: cursor ? `${cursor.substring(0, 20)}...` : undefined })
    );

    const res = await fetch(`${apiUrl}/business/catalog/list`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Catalog Sync] Erro página ${page}:`, res.status, errText);
      break;
    }

    const data = await res.json();

    // Na primeira página, loga a estrutura e a parte do paging para diagnóstico
    if (page === 1) {
      const meta = extractResponseMeta(data);
      console.log("[Catalog Sync] Estrutura da resposta:", JSON.stringify(meta));
      // Loga o paging literal se existir
      const resp = (data as any)?.response || data;
      if (resp?.paging || resp?.Paging) {
        console.log("[Catalog Sync] paging encontrado:", JSON.stringify(resp.paging || resp.Paging));
      }
    }

    const products = extractRawProducts(data);
    let added = 0;
    for (const p of products) {
      const pid = (p.ID as string) || (p.id as string) || "";
      if (pid && !seen.has(pid)) {
        seen.add(pid);
        all.push(p);
        added++;
      }
    }

    const nextCursor = extractNextCursor(data);
    console.log(
      `[Catalog Sync] Página ${page}: retornados ${products.length}, novos ${added}, total ${all.length}, próximo cursor: ${nextCursor ? "sim" : "não"}`
    );

    // Condições de parada
    if (added === 0) break;
    if (!nextCursor) break;
    if (nextCursor === cursor) break;

    cursor = nextCursor;
  } while (cursor && page < MAX_PAGES);

  return all;
}

function extractRawProducts(data: unknown): Record<string, unknown>[] {
  if (!data) return [];
  const obj = data as Record<string, unknown>;

  if (obj.response) {
    const resp = obj.response as Record<string, unknown>;
    if (Array.isArray(resp.Products)) return resp.Products as Record<string, unknown>[];
    if (Array.isArray(resp.products)) return resp.products as Record<string, unknown>[];
  }

  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (Array.isArray(obj.Products)) return obj.Products as Record<string, unknown>[];
  if (Array.isArray(obj.products)) return obj.products as Record<string, unknown>[];
  if (Array.isArray(obj.data)) return obj.data as Record<string, unknown>[];

  return [];
}

// Loga os campos de topo da resposta (sem o array de Products) para diagnóstico
function extractResponseMeta(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object") return {};
  const obj = data as Record<string, unknown>;
  const meta: Record<string, unknown> = {};

  const walk = (src: Record<string, unknown>, target: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(src)) {
      if (k === "Products" || k === "products") {
        target[k] = `[array com ${Array.isArray(v) ? v.length : 0} items]`;
      } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
        target[k] = {};
        walk(v as Record<string, unknown>, target[k] as Record<string, unknown>);
      } else {
        target[k] = v;
      }
    }
  };

  walk(obj, meta);
  return meta;
}

function extractNextCursor(data: unknown): string | undefined {
  if (!data) return undefined;
  const obj = data as Record<string, unknown>;

  const fromPaging = (paging: unknown): string | undefined => {
    if (!paging || typeof paging !== "object") return undefined;
    const p = paging as Record<string, unknown>;
    // UazAPI usa Paging.After (PascalCase)
    if (typeof p.After === "string" && p.After) return p.After;
    if (typeof p.after === "string" && p.after) return p.after;
    if (typeof p.Next === "string" && p.Next) return p.Next;
    if (typeof p.next === "string" && p.next) return p.next;
    // Formato aninhado: paging.cursors.after
    const cursors = p.cursors as Record<string, string> | undefined;
    if (cursors?.after) return cursors.after;
    return undefined;
  };

  if (typeof obj.cursor === "string" && obj.cursor) return obj.cursor;
  if (typeof obj.next_cursor === "string" && obj.next_cursor) return obj.next_cursor;
  if (typeof obj.nextCursor === "string" && obj.nextCursor) return obj.nextCursor;
  const topPaging = fromPaging(obj.paging);
  if (topPaging) return topPaging;
  const topPagingUpper = fromPaging(obj.Paging);
  if (topPagingUpper) return topPagingUpper;

  if (obj.response) {
    const resp = obj.response as Record<string, unknown>;
    if (typeof resp.cursor === "string" && resp.cursor) return resp.cursor;
    if (typeof resp.NextCursor === "string" && resp.NextCursor) return resp.NextCursor;
    if (typeof resp.nextCursor === "string" && resp.nextCursor) return resp.nextCursor;
    const respPaging = fromPaging(resp.paging);
    if (respPaging) return respPaging;
    const respPagingUpper = fromPaging(resp.Paging);
    if (respPagingUpper) return respPagingUpper;
  }

  return undefined;
}

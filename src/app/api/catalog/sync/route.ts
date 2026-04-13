import { NextRequest, NextResponse } from "next/server";
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
    const instanceMeta = (instance.metadata as Record<string, unknown>) || {};
    const catalogBusinessId = (instanceMeta.catalogBusinessId as string) || "";
    console.log("[Catalog Sync] JID:", jid, "| catalogBusinessId:", catalogBusinessId);

    // 2. Paginar todos os produtos da listagem
    const allRawProducts: Record<string, unknown>[] = [];
    let cursor: string | undefined = undefined;
    let page = 0;

    do {
      page++;
      const body: Record<string, unknown> = {};
      if (jid) body.jid = jid;
      if (cursor) body.cursor = cursor;

      const listRes = await fetch(`${apiUrl}/business/catalog/list`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token },
        body: JSON.stringify(body),
      });

      if (!listRes.ok) {
        const errText = await listRes.text();
        console.error("[Catalog Sync] Erro na listagem página", page, listRes.status, errText);
        if (page === 1) {
          return NextResponse.json(
            { error: "Erro ao buscar catálogo no WhatsApp", details: errText },
            { status: listRes.status }
          );
        }
        break; // Para paginação mas salva o que já veio
      }

      const listData = await listRes.json();
      console.log("[Catalog Sync] Página", page, "raw:", JSON.stringify(listData).substring(0, 300));

      const pageProducts = extractRawProducts(listData);
      allRawProducts.push(...pageProducts);

      // Extrair cursor para próxima página
      cursor = extractNextCursor(listData);
      console.log("[Catalog Sync] Página", page, "→", pageProducts.length, "produtos | next cursor:", cursor ?? "nenhum");
    } while (cursor && page < 50); // Limite de 50 páginas como segurança

    console.log("[Catalog Sync] Total de produtos encontrados:", allRawProducts.length);

    if (allRawProducts.length === 0) {
      return NextResponse.json({
        success: true,
        synced: 0,
        message: "Nenhum produto encontrado no catálogo do WhatsApp.",
      });
    }

    // 3. Para cada produto, buscar detalhes completos (descrição + fotos)
    let synced = 0;
    for (const raw of allRawProducts) {
      const waProductId =
        (raw.ID as string) || (raw.id as string) || (raw.productId as string) || "";
      if (!waProductId) continue;

      // Buscar info detalhada do produto
      let detailedRaw = raw;
      try {
        const infoRes = await fetch(`${apiUrl}/business/catalog/info`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token },
          body: JSON.stringify({ jid, id: waProductId }),
        });
        if (infoRes.ok) {
          const infoData = await infoRes.json();
          // Log completo do primeiro produto para diagnóstico
          if (synced === 0) {
            console.log("[Catalog Sync] INFO response completo (primeiro produto):", JSON.stringify(infoData));
          }
          // Mescla os dados detalhados com os básicos (detalhados têm prioridade)
          const infoProduct = extractSingleProduct(infoData) || infoData;
          detailedRaw = { ...raw, ...infoProduct };
        }
      } catch {
        // Usa os dados básicos da listagem
      }

      const price = detailedRaw.Price as Record<string, string> | undefined;
      const images = detailedRaw.Images as Array<Record<string, unknown>> | undefined;

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

      const name =
        (detailedRaw.Name as string) ||
        (detailedRaw.name as string) ||
        (detailedRaw.title as string) ||
        "Sem nome";

      const description =
        (detailedRaw.Description as string) ||
        (detailedRaw.description as string) ||
        (detailedRaw.body as string) ||
        (detailedRaw.Body as string) ||
        null;

      // Constrói o link do produto usando o catalogBusinessId configurado nas settings
      const catalogLink = catalogBusinessId
        ? `https://wa.me/p/${waProductId}/${catalogBusinessId}`
        : null;

      const productUrl =
        catalogLink ||
        (detailedRaw.Url as string) ||
        (detailedRaw.url as string) ||
        (detailedRaw.ShareLink as string) ||
        (detailedRaw.shareLink as string) ||
        null;

      console.log(
        `[Catalog Sync] Produto "${name}" | desc: ${!!description} | imagens: ${imageList.length}`
      );

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
          price: formattedPrice || (detailedRaw.price as string) || null,
          priceAmount: price?.Amount || null,
          currency: price?.Currency || "BRL",
          availability:
            (detailedRaw.Availability as string) ||
            (detailedRaw.availability as string) ||
            null,
          isHidden: (detailedRaw.IsHidden as boolean) ?? false,
          retailerId:
            (detailedRaw.RetailerID as string) ||
            (detailedRaw.retailerId as string) ||
            null,
          url: productUrl,
          images: imageList as any,
          rawData: detailedRaw as any,
          syncedAt: new Date(),
        },
        update: {
          instanceId: instance.id,
          name,
          description,
          price: formattedPrice || (detailedRaw.price as string) || null,
          priceAmount: price?.Amount || null,
          currency: price?.Currency || "BRL",
          availability:
            (detailedRaw.Availability as string) ||
            (detailedRaw.availability as string) ||
            null,
          isHidden: (detailedRaw.IsHidden as boolean) ?? false,
          retailerId:
            (detailedRaw.RetailerID as string) ||
            (detailedRaw.retailerId as string) ||
            null,
          url: productUrl,
          images: imageList as any,
          rawData: detailedRaw as any,
          syncedAt: new Date(),
        },
      });
      synced++;
    }

    return NextResponse.json({ success: true, synced, total: allRawProducts.length });
  } catch (error) {
    console.error("[POST /api/catalog/sync] Erro:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

// Extrai array de produtos de qualquer formato da UazAPI
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
  if (Array.isArray(obj.catalog)) return obj.catalog as Record<string, unknown>[];
  if (Array.isArray(obj.items)) return obj.items as Record<string, unknown>[];
  if (Array.isArray(obj.data)) return obj.data as Record<string, unknown>[];
  if (obj.ID || obj.id) return [obj];

  return [];
}

// Extrai produto único de resposta de /info
function extractSingleProduct(data: unknown): Record<string, unknown> | null {
  if (!data) return null;
  const obj = data as Record<string, unknown>;

  if (obj.response) {
    const resp = obj.response as Record<string, unknown>;
    if (resp.ID || resp.id) return resp;
    const products = extractRawProducts(obj.response);
    if (products.length > 0) return products[0];
  }

  if (obj.ID || obj.id) return obj;
  if (obj.data) return obj.data as Record<string, unknown>;

  return null;
}

// Extrai cursor para próxima página
function extractNextCursor(data: unknown): string | undefined {
  if (!data) return undefined;
  const obj = data as Record<string, unknown>;

  // Formato direto
  if (typeof obj.cursor === "string" && obj.cursor) return obj.cursor;
  if (typeof obj.next_cursor === "string" && obj.next_cursor) return obj.next_cursor;

  // Dentro de response
  if (obj.response) {
    const resp = obj.response as Record<string, unknown>;
    if (typeof resp.cursor === "string" && resp.cursor) return resp.cursor;
    if (typeof resp.next_cursor === "string" && resp.next_cursor) return resp.next_cursor;

    // Formato Facebook/WhatsApp: paging.cursors.after
    if (resp.paging) {
      const paging = resp.paging as Record<string, unknown>;
      if (typeof paging.next === "string" && paging.next) {
        // URL completa — extrai só o cursor
        try {
          const after = new URL(paging.next).searchParams.get("after");
          return after || undefined;
        } catch {
          return paging.next;
        }
      }
      const cursors = paging.cursors as Record<string, string> | undefined;
      if (cursors?.after) return cursors.after;
    }
  }

  // Paging no nível raiz
  if (obj.paging) {
    const paging = obj.paging as Record<string, unknown>;
    const cursors = paging.cursors as Record<string, string> | undefined;
    if (cursors?.after) return cursors.after;
  }

  return undefined;
}

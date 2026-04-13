import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/api/auth";

// POST /api/catalog/sync — importa produtos da UazAPI e salva no banco
export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.companyId) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 403 });
  }

  try {
    const instance = await prisma.whatsappInstance.findFirst({
      where: { companyId: auth.companyId, isActive: true },
      select: { id: true, apiUrl: true, instanceApiKey: true, instanceName: true },
    });

    if (!instance) {
      return NextResponse.json({ error: "Instância do WhatsApp não encontrada" }, { status: 503 });
    }
    if (!instance.apiUrl || !instance.instanceApiKey) {
      return NextResponse.json({ error: "Instância não configurada corretamente (faltam apiUrl ou token)" }, { status: 503 });
    }

    // Buscar JID da instância (exigido pela UazAPI no endpoint de catálogo)
    let jid = "";
    try {
      const statusRes = await fetch(`${instance.apiUrl}/instance/status`, {
        method: "GET",
        headers: { "Accept": "application/json", token: instance.instanceApiKey },
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
      // Se não conseguir o JID, tenta sem ele
    }

    // Buscar catálogo na UazAPI
    const uazRes = await fetch(`${instance.apiUrl}/business/catalog/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        token: instance.instanceApiKey,
      },
      body: JSON.stringify(jid ? { jid } : {}),
    });

    if (!uazRes.ok) {
      const errText = await uazRes.text();
      console.error("[Catalog Sync] UazAPI error:", uazRes.status, errText);
      return NextResponse.json(
        { error: "Erro ao buscar catálogo no WhatsApp", details: errText },
        { status: uazRes.status }
      );
    }

    const uazData = await uazRes.json();
    console.log("[Catalog Sync] UazAPI response:", JSON.stringify(uazData).substring(0, 500));

    // Extrair array de produtos do formato da UazAPI
    const rawProducts = extractRawProducts(uazData);
    console.log("[Catalog Sync] Produtos encontrados:", rawProducts.length);

    if (rawProducts.length === 0) {
      return NextResponse.json({ success: true, synced: 0, message: "Nenhum produto encontrado no catálogo do WhatsApp." });
    }

    // Upsert de cada produto no banco
    let synced = 0;
    for (const raw of rawProducts) {
      const waProductId = (raw.ID as string) || (raw.id as string) || (raw.productId as string) || "";
      if (!waProductId) continue;

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

      const imageList = (images ?? []).map((img) => ({
        id: (img.ID as string) || "",
        originalUrl: (img.OriginalImageUrl as string) || (img.RequestImageUrl as string) || "",
        thumbUrl: (img.RequestImageUrl as string) || "",
      }));

      await prisma.catalogProduct.upsert({
        where: {
          companyId_waProductId: {
            companyId: auth.companyId,
            waProductId,
          },
        },
        create: {
          companyId: auth.companyId,
          instanceId: instance.id,
          waProductId,
          name: (raw.Name as string) || (raw.name as string) || (raw.title as string) || "Sem nome",
          description: (raw.Description as string) || (raw.description as string) || null,
          price: formattedPrice || (raw.price as string) || null,
          priceAmount: price?.Amount || null,
          currency: price?.Currency || "BRL",
          availability: (raw.Availability as string) || (raw.availability as string) || null,
          isHidden: (raw.IsHidden as boolean) ?? false,
          retailerId: (raw.RetailerID as string) || (raw.retailerId as string) || null,
          url: (raw.Url as string) || (raw.url as string) || null,
          images: imageList as any,
          rawData: raw as any,
          syncedAt: new Date(),
        },
        update: {
          instanceId: instance.id,
          name: (raw.Name as string) || (raw.name as string) || (raw.title as string) || "Sem nome",
          description: (raw.Description as string) || (raw.description as string) || null,
          price: formattedPrice || (raw.price as string) || null,
          priceAmount: price?.Amount || null,
          currency: price?.Currency || "BRL",
          availability: (raw.Availability as string) || (raw.availability as string) || null,
          isHidden: (raw.IsHidden as boolean) ?? false,
          retailerId: (raw.RetailerID as string) || (raw.retailerId as string) || null,
          url: (raw.Url as string) || (raw.url as string) || null,
          images: imageList as any,
          rawData: raw as any,
          syncedAt: new Date(),
        },
      });
      synced++;
    }

    return NextResponse.json({ success: true, synced, total: rawProducts.length });
  } catch (error) {
    console.error("[POST /api/catalog/sync] Erro:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

function extractRawProducts(data: unknown): Record<string, unknown>[] {
  if (!data) return [];
  const obj = data as Record<string, unknown>;

  // Formato real da UazAPI: { response: { Products: [...] } }
  if (obj.response) {
    const resp = obj.response as Record<string, unknown>;
    if (Array.isArray(resp.Products)) return resp.Products as Record<string, unknown>[];
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

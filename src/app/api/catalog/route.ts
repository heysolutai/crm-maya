import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/api/auth";
import { handleApiError } from '@/lib/api/errors'

// GET /api/catalog — lista produtos do banco local
//
// Query params:
//   search = busca textual (case-insensitive) em name + description + attributes.
//            Ex: ?search=250 → retorna qualquer produto com "250" em qualquer
//            lugar (título, descrição, atributos JSON).
//   limit  = máx de resultados (default 100, máx 500)
//
// A interpretação de contexto (se "250" é cc, preço, páginas, etc) fica
// por conta do consumidor (ex: n8n/IA fazendo rerank com os attributes).
export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.companyId) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") || "").trim();
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);

    let products;

    if (search) {
      // Busca em name + description + attributes::text.
      // Usa $queryRaw porque Prisma não suporta cast de JSONB para texto no findMany.
      const like = `%${search}%`;
      products = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          id,
          company_id        AS "companyId",
          instance_id       AS "instanceId",
          wa_product_id     AS "waProductId",
          name,
          description,
          price,
          price_amount      AS "priceAmount",
          currency,
          availability,
          is_hidden         AS "isHidden",
          retailer_id       AS "retailerId",
          url,
          images,
          attributes,
          synced_at         AS "syncedAt",
          created_at        AS "createdAt",
          updated_at        AS "updatedAt"
        FROM catalog_products
        WHERE company_id = ${auth.companyId}::uuid
          AND (
            name ILIKE ${like}
            OR COALESCE(description, '') ILIKE ${like}
            OR COALESCE(attributes::text, '') ILIKE ${like}
          )
        ORDER BY name ASC
        LIMIT ${limit}
      `;
    } else {
      // Sem search: usa findMany normal
      products = await prisma.catalogProduct.findMany({
        where: { companyId: auth.companyId },
        orderBy: { name: "asc" },
        take: limit,
      });
    }

    return NextResponse.json({ data: products, total: Array.isArray(products) ? products.length : 0 });
  } catch (error) {
    return handleApiError(error, '[GET /api/catalog] Erro')
  }
}

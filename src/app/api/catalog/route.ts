import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/api/auth";

// GET /api/catalog — lista produtos do banco local com filtros estruturados
//
// Query params:
//   search         = busca textual em nome/descrição
//   brand          = filtra por marca exata (case-insensitive)
//   cc             = cilindrada exata (ex: 250)
//   ccMin / ccMax  = faixa de cilindrada (ex: ccMin=200&ccMax=300)
//   year           = ano (ex: 2025 — match em qualquer parte do campo)
//   priceMin / priceMax = faixa de preço em CENTAVOS × 1000 (ex: priceMin=10000000 = R$10.000)
//   hideOutOfStock = "true" para ocultar produtos ocultos no catálogo
//   limit          = máx de resultados (default 100, máx 500)
export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.companyId) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const brand = searchParams.get("brand");
    const cc = searchParams.get("cc");
    const ccMin = searchParams.get("ccMin");
    const ccMax = searchParams.get("ccMax");
    const year = searchParams.get("year");
    const priceMin = searchParams.get("priceMin");
    const priceMax = searchParams.get("priceMax");
    const hideOutOfStock = searchParams.get("hideOutOfStock") === "true";
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);

    const where: Prisma.CatalogProductWhereInput = {
      companyId: auth.companyId,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    if (brand) {
      where.brand = { equals: brand, mode: "insensitive" };
    }

    if (cc) {
      const n = parseInt(cc, 10);
      if (!isNaN(n)) where.displacementCc = n;
    } else if (ccMin || ccMax) {
      where.displacementCc = {};
      if (ccMin) {
        const n = parseInt(ccMin, 10);
        if (!isNaN(n)) (where.displacementCc as Prisma.IntFilter).gte = n;
      }
      if (ccMax) {
        const n = parseInt(ccMax, 10);
        if (!isNaN(n)) (where.displacementCc as Prisma.IntFilter).lte = n;
      }
    }

    if (year) {
      where.vehicleYear = { contains: year };
    }

    if (priceMin || priceMax) {
      // priceAmount é string no DB; usamos cast numérico em SQL raw não é trivial com findMany,
      // então filtramos em JavaScript depois da busca.
    }

    if (hideOutOfStock) {
      where.isHidden = false;
    }

    let products = await prisma.catalogProduct.findMany({
      where,
      orderBy: { name: "asc" },
      take: limit,
    });

    // Filtro de preço pós-busca (priceAmount é string, em centavos × 1000)
    if (priceMin || priceMax) {
      const min = priceMin ? parseInt(priceMin, 10) : null;
      const max = priceMax ? parseInt(priceMax, 10) : null;
      products = products.filter((p) => {
        if (!p.priceAmount) return false;
        const amount = parseInt(p.priceAmount, 10);
        if (isNaN(amount)) return false;
        if (min !== null && amount < min) return false;
        if (max !== null && amount > max) return false;
        return true;
      });
    }

    return NextResponse.json({ data: products, total: products.length });
  } catch (error) {
    console.error("[GET /api/catalog] Erro:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

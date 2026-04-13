import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/api/auth";
import { z } from "zod";

const patchSchema = z.object({
  isHidden: z.boolean(),
});

// PATCH /api/catalog/[id] — atualiza visibilidade no banco local
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req);
  if (!auth.companyId) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const validation = patchSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    const existing = await prisma.catalogProduct.findFirst({
      where: { id, companyId: auth.companyId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
    }

    const updated = await prisma.catalogProduct.update({
      where: { id },
      data: { isHidden: validation.data.isHidden },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[PATCH /api/catalog/[id]] Erro:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

// DELETE /api/catalog/[id] — remove produto do banco local
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req);
  if (!auth.companyId) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 403 });
  }

  try {
    const { id } = await params;

    const existing = await prisma.catalogProduct.findFirst({
      where: { id, companyId: auth.companyId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
    }

    await prisma.catalogProduct.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/catalog/[id]] Erro:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

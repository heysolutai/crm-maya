import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/api/auth";
import { z } from "zod";
import { handleApiError } from '@/lib/api/errors'

const patchSchema = z.object({
  isHidden: z.boolean().optional(),
  // attributes: objeto livre (vai ser salvo como JSONB).
  // Pode ser populado externamente (ex: n8n extrai e faz PATCH aqui).
  attributes: z.record(z.string(), z.unknown()).optional(),
  // mergeAttributes: se true, faz merge com os attributes existentes;
  // se false ou ausente, substitui o JSON inteiro.
  mergeAttributes: z.boolean().optional(),
});

// PATCH /api/catalog/[id] — atualiza produto (visibilidade e/ou attributes)
//
// Body examples:
//   { "isHidden": true }                                     → oculta produto
//   { "attributes": {"cc": 250, "brand": "Honda"} }          → substitui attributes
//   { "attributes": {"ram": "8GB"}, "mergeAttributes": true} → faz merge
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
      return NextResponse.json({ error: "Dados inválidos", details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const existing = await prisma.catalogProduct.findFirst({
      where: { id, companyId: auth.companyId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    const { isHidden, attributes, mergeAttributes } = validation.data;

    if (isHidden !== undefined) data.isHidden = isHidden;

    if (attributes !== undefined) {
      if (mergeAttributes) {
        const current = (existing.attributes as Record<string, unknown>) || {};
        data.attributes = { ...current, ...attributes };
      } else {
        data.attributes = attributes;
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
    }

    const updated = await prisma.catalogProduct.update({
      where: { id },
      data,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleApiError(error, '[PATCH /api/catalog/[id]] Erro')
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
    return handleApiError(error, '[DELETE /api/catalog/[id]] Erro')
  }
}

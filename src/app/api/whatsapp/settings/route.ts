import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/api/auth";
import { z } from "zod";
import { handleApiError } from '@/lib/api/errors'

const schema = z.object({
  instanceId: z.string().uuid(),
  catalogBusinessId: z.string().min(1).max(50),
});

// PATCH /api/whatsapp/settings — salva configurações da instância WhatsApp
export async function PATCH(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.companyId) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const validation = schema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: "Dados inválidos", details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const { instanceId, catalogBusinessId } = validation.data;

    const instance = await prisma.inbox.findFirst({
      where: { id: instanceId, companyId: auth.companyId },
    });
    if (!instance) {
      return NextResponse.json({ error: "Instância não encontrada" }, { status: 404 });
    }

    // Mescla catalogBusinessId no metadata existente sem sobrescrever outros campos
    const currentMetadata = (instance.metadata as Record<string, unknown>) || {};
    const updatedMetadata = { ...currentMetadata, catalogBusinessId };

    await prisma.inbox.update({
      where: { id: instanceId },
      data: { metadata: updatedMetadata },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, '[PATCH /api/whatsapp/settings] Erro')
  }
}

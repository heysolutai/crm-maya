import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/api/auth";
import { handleCors, jsonResponse, errorResponse } from "@/lib/api/cors";

const pickupSchema = z.object({
  conversation_id: z.string().uuid(),
});

export async function OPTIONS(req: NextRequest) {
  return handleCors(req) || jsonResponse(null);
}

export async function POST(req: NextRequest) {
  try {
    const { agentId, companyId } = await authenticate(req);
    if (!agentId) return errorResponse("Autenticação necessária", 401);

    const body = await req.json();
    const validation = pickupSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse("Dados inválidos", 400);
    }

    const { conversation_id } = validation.data;

    // Verify conversation belongs to company and is waiting
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversation_id,
        companyId: companyId || "",
        status: "pending",
      },
      select: { id: true, departmentId: true },
    });

    if (!conversation) {
      return errorResponse("Conversa não encontrada ou não está na fila", 404);
    }

    // Assign to the requesting agent (conditional update to prevent race conditions)
    const result = await prisma.conversation.updateMany({
      where: {
        id: conversation_id,
        status: "pending",
      },
      data: {
        transferredTo: agentId,
        status: "active",
        updatedAt: new Date(),
      },
    });

    if (result.count === 0) {
      return errorResponse("Conversa já foi atribuída a outro agente", 409);
    }

    const agent = await prisma.user.findUnique({
      where: { id: agentId },
      select: { fullName: true },
    });

    console.log(`[Pickup] Agent ${agentId} (${agent?.fullName}) picked up conversation ${conversation_id}`);

    return jsonResponse({
      success: true,
      conversation_id,
      assigned_to: { user_id: agentId, full_name: agent?.fullName },
    });
  } catch (error) {
    console.error("[Pickup] Error:", error);
    return errorResponse("Erro interno do servidor");
  }
}

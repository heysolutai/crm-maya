import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/api/auth";

export async function GET(req: NextRequest) {
  const { companyId } = await authenticate(req);
  if (!companyId) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 403 });
  }

  try {
    // Count waiting conversations per department
    const queueCounts = await prisma.conversation.groupBy({
      by: ["departmentId"],
      where: {
        companyId,
        status: "pending",
        departmentId: { not: null },
      },
      _count: { id: true },
    });

    const result: Record<string, number> = {};
    for (const item of queueCounts) {
      if (item.departmentId) {
        result[item.departmentId] = item._count.id;
      }
    }

    // Total waiting (including without department)
    const totalWaiting = await prisma.conversation.count({
      where: { companyId, status: "pending" },
    });

    return NextResponse.json({ queues: result, totalWaiting });
  } catch (error) {
    console.error("Erro ao buscar fila:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

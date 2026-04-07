import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/api/auth";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  color: z.string().max(20).optional(),
  isActive: z.boolean().optional(),
  businessHours: z.record(z.string(), z.object({
    enabled: z.boolean(),
    start: z.string(),
    end: z.string(),
  })).optional(),
  appointmentSettings: z.object({
    default_duration_minutes: z.number().min(5).max(480).optional(),
    slot_interval_minutes: z.number().min(5).max(120).optional(),
    buffer_between_appointments_minutes: z.number().min(0).max(120).optional(),
    min_notice_hours: z.number().min(0).optional(),
    advance_booking_days: z.number().min(1).max(365).optional(),
  }).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate(req);
  if (!auth.companyId) {
    return NextResponse.json({ error: "Empresa nao encontrada" }, { status: 403 });
  }

  try {
    const { id } = await params;

    const schedule = await prisma.doctorSchedule.findFirst({
      where: { id, companyId: auth.companyId },
      include: {
        user: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        _count: { select: { appointments: true } },
      },
    });

    if (!schedule) {
      return NextResponse.json({ error: "Agenda nao encontrada" }, { status: 404 });
    }

    return NextResponse.json({ data: schedule });
  } catch (error) {
    console.error("Erro ao buscar agenda:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate(req);
  if (!auth.companyId) {
    return NextResponse.json({ error: "Empresa nao encontrada" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const validation = updateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Dados invalidos", details: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const existing = await prisma.doctorSchedule.findFirst({
      where: { id, companyId: auth.companyId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Agenda nao encontrada" }, { status: 404 });
    }

    const updated = await prisma.doctorSchedule.update({
      where: { id },
      data: validation.data,
      include: {
        user: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("Erro ao atualizar agenda:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate(req);
  if (!auth.companyId) {
    return NextResponse.json({ error: "Empresa nao encontrada" }, { status: 403 });
  }

  try {
    const { id } = await params;

    const existing = await prisma.doctorSchedule.findFirst({
      where: { id, companyId: auth.companyId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Agenda nao encontrada" }, { status: 404 });
    }

    await prisma.doctorSchedule.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao excluir agenda:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

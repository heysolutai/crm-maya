import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/api/auth";
import { z } from "zod";

const createSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().min(1).max(255),
  color: z.string().max(20).optional(),
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

const listQuerySchema = z.object({
  userId: z.string().uuid().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.companyId) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const validation = listQuerySchema.safeParse({
      userId: searchParams.get("userId") ?? undefined,
    });
    if (!validation.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { userId } = validation.data;

    const schedules = await prisma.doctorSchedule.findMany({
      where: {
        companyId: auth.companyId,
        ...(userId && { userId }),
      },
      include: {
        user: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        _count: { select: { appointments: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ data: schedules });
  } catch (error) {
    console.error("Erro ao buscar agendas:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  const companyId = auth.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const validation = createSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { userId, name, color, businessHours, appointmentSettings } = validation.data;

    // Validate user belongs to company
    const user = await prisma.user.findFirst({
      where: { id: userId, companyId },
    });
    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado nesta empresa" }, { status: 400 });
    }

    // Check if user already has a schedule
    const existing = await prisma.doctorSchedule.findFirst({
      where: { companyId, userId },
    });
    if (existing) {
      return NextResponse.json({ error: "Este profissional já possui uma agenda" }, { status: 409 });
    }

    const schedule = await prisma.doctorSchedule.create({
      data: {
        companyId,
        userId,
        name,
        color: color || "#6366f1",
        businessHours: businessHours || {},
        appointmentSettings: appointmentSettings || {},
      },
      include: {
        user: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
      },
    });

    return NextResponse.json({ data: schedule }, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar agenda:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

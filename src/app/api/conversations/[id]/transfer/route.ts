import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { authenticate } from '@/lib/api/auth';
import { logAction } from '@/lib/services/audit';

const transferSchema = z.object({
  departmentId: z.string().uuid('departmentId inválido'),
  assignedTo: z.string().uuid().optional().nullable(),
  note: z.string().max(1000).optional(),
});

/**
 * POST /api/conversations/[id]/transfer
 *
 * Transfere uma conversa para um departamento. Opcionalmente pode
 * atribuir a um agente específico dentro desse departamento.
 *
 * Body:
 *   departmentId: UUID do departamento (obrigatório)
 *   assignedTo?:  UUID do agente (opcional) — se informado, precisa ser
 *                 membro do departamento
 *   note?:        Texto para registrar uma nota na conversa sobre a transferência
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { agentId, companyId } = await authenticate(req);
  if (!companyId) {
    return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 403 });
  }

  try {
    const { id } = await params;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: 'ID de conversa inválido' }, { status: 400 });
    }

    const body = await req.json();
    const validation = transferSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { departmentId, assignedTo, note } = validation.data;

    // 1. Valida a conversa — deve pertencer à empresa do usuário
    const conversation = await prisma.conversation.findFirst({
      where: { id, companyId },
      select: { id: true, departmentId: true, clientId: true },
    });
    if (!conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });
    }

    // 2. Valida o departamento — deve pertencer à mesma empresa e estar ativo
    const department = await prisma.department.findFirst({
      where: { id: departmentId, companyId, isActive: true },
      select: { id: true, name: true },
    });
    if (!department) {
      return NextResponse.json({ error: 'Departamento inválido' }, { status: 400 });
    }

    // 3. Se atribuiu a um agente, valida que ele é membro do departamento e da empresa
    if (assignedTo) {
      const member = await prisma.departmentMember.findFirst({
        where: { departmentId, userId: assignedTo },
        select: { userId: true },
      });
      if (!member) {
        return NextResponse.json(
          { error: 'Agente informado não pertence a este departamento' },
          { status: 400 }
        );
      }

      const agentUser = await prisma.user.findFirst({
        where: { id: assignedTo, companyId, isActive: true },
        select: { id: true },
      });
      if (!agentUser) {
        return NextResponse.json({ error: 'Agente inválido' }, { status: 400 });
      }
    }

    // 4. Atualiza a conversa
    const updated = await prisma.conversation.update({
      where: { id },
      data: {
        departmentId,
        transferredTo: assignedTo ?? null,
        status: 'transferred',
      },
      select: {
        id: true,
        departmentId: true,
        transferredTo: true,
        status: true,
        department: { select: { id: true, name: true, color: true } },
      },
    });

    // 5. Se veio uma nota, registra na conversa
    if (note && note.trim()) {
      await prisma.conversationNote.create({
        data: {
          conversationId: id,
          companyId,
          createdBy: agentId,
          note: `Transferida para ${department.name}: ${note.trim()}`,
        },
      }).catch((e) => {
        console.error('[Transfer] Falha ao registrar nota:', e);
      });
    }

    // 6. Auditoria
    await logAction({
      companyId,
      userId: agentId,
      action: 'UPDATE',
      entity: 'Conversation',
      entityId: id,
      details: {
        operation: 'transfer',
        fromDepartmentId: conversation.departmentId,
        toDepartmentId: departmentId,
        assignedTo: assignedTo ?? null,
        note: note ?? null,
      },
    });

    return NextResponse.json({ success: true, conversation: updated });
  } catch (error) {
    console.error('[POST /api/conversations/[id]/transfer] Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { authenticate } from '@/lib/api/auth';
import { assignNextAgent, assignNextAgentInDepartment } from '@/lib/api/database';
import { handleCors, jsonResponse, errorResponse, badRequestResponse } from '@/lib/api/cors';

const transferSchema = z.object({
  conversation_id: z.string().uuid(),
  target_user_id: z.string().uuid().optional(),
  department_id: z.string().uuid().optional(),
  mode: z.enum(['manual', 'round-robin', 'department']).optional().default('manual'),
});

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    const { agentId, companyId } = await authenticate(req);

    const body = await req.json();
    const validation = transferSchema.safeParse(body);

    if (!validation.success) {
      return errorResponse('Dados inválidos', 400);
    }

    const { conversation_id: conversationId, target_user_id: targetUserId, department_id: departmentId, mode } = validation.data;

    if (!conversationId) return badRequestResponse('conversation_id is required');

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, companyId: companyId || '' },
      select: { id: true, companyId: true, transferredTo: true, clientId: true },
    });

    if (!conversation) return errorResponse('Conversation not found or access denied', 404);

    let assignedUserId: string | null = null;

    // Mode: department — round-robin among online agents of a department
    if (mode === 'department') {
      if (!departmentId) return badRequestResponse('department_id is required for department transfer');

      // Verify department exists and belongs to company
      const dept = await prisma.department.findFirst({
        where: { id: departmentId, companyId: companyId || '', isActive: true },
        select: { id: true, name: true },
      });

      if (!dept) return errorResponse('Department not found or inactive', 404);

      assignedUserId = await assignNextAgentInDepartment(companyId || '', departmentId || '');

      if (!assignedUserId) {
        // QUEUE: No online agents — put conversation in department queue
        await prisma.conversation.update({
          where: { id: conversationId },
          data: {
            departmentId,
            transferredTo: null,
            status: 'waiting',
            aiHandled: false,
            updatedAt: new Date(),
          },
        });

        console.log(`[Transfer] Conversation ${conversationId} queued in department ${dept.name} (no online agents)`);

        return jsonResponse({
          success: true,
          conversation_id: conversationId,
          queued: true,
          department: { id: dept.id, name: dept.name },
          transferred_to: null,
          mode: 'department',
        });
      }

      // Agent found — assign and set department
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          transferredTo: assignedUserId,
          departmentId,
          status: 'transferred',
          aiHandled: false,
          updatedAt: new Date(),
        },
      });

      const assignedUser = await prisma.user.findUnique({
        where: { id: assignedUserId },
        select: { fullName: true, email: true },
      });

      console.log(`[Transfer] Conversation ${conversationId} transferred to ${assignedUserId} in department ${dept.name}`);

      return jsonResponse({
        success: true,
        conversation_id: conversationId,
        queued: false,
        department: { id: dept.id, name: dept.name },
        transferred_to: { user_id: assignedUserId, full_name: assignedUser?.fullName ?? null, email: assignedUser?.email ?? null },
        mode: 'department',
      });
    }

    // Mode: round-robin (company-wide, existing behavior)
    if (mode === 'round-robin') {
      assignedUserId = await assignNextAgent(companyId || '');
      if (!assignedUserId) return errorResponse('No active agents available for round-robin assignment', 422);
    } else {
      // Mode: manual
      if (!targetUserId) return badRequestResponse('target_user_id is required for manual transfer');
      const targetUser = await prisma.user.findFirst({
        where: { id: targetUserId, companyId, isActive: true },
        select: { id: true, fullName: true },
      });
      if (!targetUser) return errorResponse('Target user not found or inactive', 404);
      assignedUserId = targetUserId;
    }

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { transferredTo: assignedUserId, aiHandled: false, updatedAt: new Date() },
    });

    const assignedUser = await prisma.user.findUnique({
      where: { id: assignedUserId! },
      select: { fullName: true, email: true },
    });

    console.log(`[Transfer] Conversation ${conversationId} transferred to ${assignedUserId} (mode: ${mode})`);

    return jsonResponse({
      success: true,
      conversation_id: conversationId,
      transferred_to: { user_id: assignedUserId, full_name: assignedUser?.fullName ?? null, email: assignedUser?.email ?? null },
      mode,
    });
  } catch (error) {
    console.error('[Transfer] Error:', error);
    return errorResponse('Erro interno do servidor');
  }
}

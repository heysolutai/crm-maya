import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticate } from '@/lib/api/auth';
import { assignNextAgentInDepartment } from '@/lib/api/database';
import { handleCors, jsonResponse, errorResponse } from '@/lib/api/cors';

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    const { agentId, companyId } = await authenticate(req);

    if (!agentId) return errorResponse('Agent authentication required', 401);

    // 1. Get departments this agent belongs to
    const memberships = await prisma.departmentMember.findMany({
      where: { userId: agentId },
      select: { departmentId: true },
    });

    if (!memberships || memberships.length === 0) {
      return jsonResponse({ picked_up: 0 });
    }

    const departmentIds = memberships.map(m => m.departmentId);

    // 2. Find queued conversations (department_id set, transferred_to IS NULL, status waiting)
    const queuedConversations = await prisma.conversation.findMany({
      where: {
        departmentId: { in: departmentIds },
        transferredTo: null,
        companyId,
        status: 'waiting',
      },
      select: { id: true, departmentId: true },
      orderBy: { updatedAt: 'asc' },
    });

    if (!queuedConversations || queuedConversations.length === 0) {
      return jsonResponse({ picked_up: 0 });
    }

    // 3. Assign conversations via department round-robin
    let pickedUp = 0;
    for (const conv of queuedConversations) {
      if (!conv.departmentId) continue;

      const assignedId = await assignNextAgentInDepartment(companyId, conv.departmentId);
      if (assignedId) {
        // Use a conditional update to prevent race conditions
        const result = await prisma.conversation.updateMany({
          where: {
            id: conv.id,
            transferredTo: null, // Prevent race conditions
          },
          data: {
            transferredTo: assignedId,
            status: 'transferred',
            updatedAt: new Date(),
          },
        });

        if (result.count > 0) pickedUp++;
      }
    }

    console.log(`[Pickup Queue] Agent ${agentId} picked up ${pickedUp} queued conversations`);

    return jsonResponse({ picked_up: pickedUp });
  } catch (error: any) {
    console.error('[Pickup Queue] Error:', error);
    if (error.message?.includes('Authentication') || error.message?.includes('API key')) return errorResponse(error.message, 401);
    return errorResponse(error.message || 'Internal server error');
  }
}

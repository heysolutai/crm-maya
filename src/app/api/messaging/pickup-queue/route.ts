import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticate } from '@/lib/api/auth';
import { assignNextAgentInDepartment } from '@/lib/api/database';
import { handleCors, jsonResponse, errorResponse } from '@/lib/api/cors';

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    const { agentId, companyId } = await authenticate(req);

    if (!agentId) return errorResponse('Agent authentication required', 401);

    const supabase = createAdminClient();

    // 1. Get departments this agent belongs to
    const { data: memberships } = await supabase
      .from('department_members')
      .select('department_id')
      .eq('user_id', agentId);

    if (!memberships || memberships.length === 0) {
      return jsonResponse({ picked_up: 0 });
    }

    const departmentIds = memberships.map(m => m.department_id);

    // 2. Find queued conversations (department_id set, transferred_to IS NULL, status waiting)
    const { data: queuedConversations } = await supabase
      .from('conversations')
      .select('id, department_id')
      .in('department_id', departmentIds)
      .is('transferred_to', null)
      .eq('company_id', companyId)
      .eq('status', 'waiting')
      .order('updated_at', { ascending: true });

    if (!queuedConversations || queuedConversations.length === 0) {
      return jsonResponse({ picked_up: 0 });
    }

    // 3. Assign conversations via department round-robin
    let pickedUp = 0;
    for (const conv of queuedConversations) {
      if (!conv.department_id) continue;

      const assignedId = await assignNextAgentInDepartment(companyId, conv.department_id);
      if (assignedId) {
        const { error } = await supabase
          .from('conversations')
          .update({
            transferred_to: assignedId,
            status: 'transferred',
            updated_at: new Date().toISOString(),
          })
          .eq('id', conv.id)
          .is('transferred_to', null); // Prevent race conditions

        if (!error) pickedUp++;
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

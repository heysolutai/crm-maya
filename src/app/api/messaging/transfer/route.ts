import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticate } from '@/lib/api/auth';
import { assignNextAgent, assignNextAgentInDepartment } from '@/lib/api/database';
import { handleCors, jsonResponse, errorResponse, badRequestResponse } from '@/lib/api/cors';

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    const { agentId, companyId } = await authenticate(req);

    const body = await req.json();
    const conversationId = body.conversation_id;
    const targetUserId = body.target_user_id;
    const departmentId = body.department_id;
    const mode = body.mode || 'manual';

    if (!conversationId) return badRequestResponse('conversation_id is required');

    const supabase = createAdminClient();

    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, company_id, transferred_to, client_id')
      .eq('id', conversationId)
      .eq('company_id', companyId)
      .single();

    if (convError || !conversation) return errorResponse('Conversation not found or access denied', 404);

    let assignedUserId: string | null = null;

    // Mode: department — round-robin among online agents of a department
    if (mode === 'department') {
      if (!departmentId) return badRequestResponse('department_id is required for department transfer');

      // Verify department exists and belongs to company
      const { data: dept, error: deptError } = await supabase
        .from('departments')
        .select('id, name')
        .eq('id', departmentId)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .single();

      if (deptError || !dept) return errorResponse('Department not found or inactive', 404);

      assignedUserId = await assignNextAgentInDepartment(companyId, departmentId);

      if (!assignedUserId) {
        // QUEUE: No online agents — put conversation in department queue
        const { error: updateError } = await supabase
          .from('conversations')
          .update({
            department_id: departmentId,
            transferred_to: null,
            status: 'waiting',
            ai_handled: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversationId);

        if (updateError) return errorResponse('Failed to queue conversation');

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
      const { error: updateError } = await supabase
        .from('conversations')
        .update({
          transferred_to: assignedUserId,
          department_id: departmentId,
          status: 'transferred',
          ai_handled: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);

      if (updateError) return errorResponse('Failed to transfer conversation');

      const { data: assignedUser } = await supabase
        .from('users')
        .select('full_name, email')
        .eq('id', assignedUserId)
        .single();

      console.log(`[Transfer] Conversation ${conversationId} transferred to ${assignedUserId} in department ${dept.name}`);

      return jsonResponse({
        success: true,
        conversation_id: conversationId,
        queued: false,
        department: { id: dept.id, name: dept.name },
        transferred_to: { user_id: assignedUserId, full_name: assignedUser?.full_name || null, email: assignedUser?.email || null },
        mode: 'department',
      });
    }

    // Mode: round-robin (company-wide, existing behavior)
    if (mode === 'round-robin') {
      assignedUserId = await assignNextAgent(companyId);
      if (!assignedUserId) return errorResponse('No active agents available for round-robin assignment', 422);
    } else {
      // Mode: manual
      if (!targetUserId) return badRequestResponse('target_user_id is required for manual transfer');
      const { data: targetUser, error: userError } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('id', targetUserId)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .single();
      if (userError || !targetUser) return errorResponse('Target user not found or inactive', 404);
      assignedUserId = targetUserId;
    }

    const { error: updateError } = await supabase
      .from('conversations')
      .update({ transferred_to: assignedUserId, ai_handled: false, updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    if (updateError) return errorResponse('Failed to transfer conversation');

    const { data: assignedUser } = await supabase.from('users').select('full_name, email').eq('id', assignedUserId).single();

    console.log(`[Transfer] Conversation ${conversationId} transferred to ${assignedUserId} (mode: ${mode})`);

    return jsonResponse({
      success: true,
      conversation_id: conversationId,
      transferred_to: { user_id: assignedUserId, full_name: assignedUser?.full_name || null, email: assignedUser?.email || null },
      mode,
    });
  } catch (error: any) {
    console.error('[Transfer] Error:', error);
    if (error.message?.includes('Authentication') || error.message?.includes('API key')) return errorResponse(error.message, 401);
    return errorResponse(error.message || 'Internal server error');
  }
}

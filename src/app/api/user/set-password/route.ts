import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse, badRequestResponse, notFoundResponse } from '@/lib/api/cors';

export async function OPTIONS(req: NextRequest) {
  return handleCors(req) || jsonResponse(null);
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();

    const { agentId } = await authenticate(req);

    if (!agentId) {
      return errorResponse('Super admin authentication required (Bearer token)', 403);
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', agentId)
      .eq('role', 'super_admin')
      .is('company_id', null)
      .single();

    if (!roleData) {
      return errorResponse('Only super admins can set passwords', 403);
    }

    const { userId, password } = await req.json();

    if (!userId || !password) {
      return badRequestResponse('userId and password are required');
    }

    if (password.length < 8) {
      return badRequestResponse('Password must be at least 8 characters');
    }

    const { data: targetUser, error: userError } = await supabase
      .from('users')
      .select('email, full_name')
      .eq('id', userId)
      .single();

    if (userError || !targetUser) {
      return notFoundResponse('User not found');
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, { password });

    if (updateError) {
      return errorResponse(updateError.message);
    }

    console.log(`Password set for user ${targetUser.email} by super_admin ${agentId}`);

    return jsonResponse({
      success: true,
      email: targetUser.email,
      userName: targetUser.full_name,
    });
  } catch (error) {
    console.error('Error in set-user-password:', error);
    return errorResponse(error instanceof Error ? error.message : 'Unknown error');
  }
}

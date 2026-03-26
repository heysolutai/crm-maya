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

    const { data: roles, error: rolesError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', agentId)
      .eq('role', 'super_admin')
      .is('company_id', null);

    if (rolesError || !roles || roles.length === 0) {
      return errorResponse('Only super admins can reset passwords', 403);
    }

    const { userId } = await req.json();

    if (!userId) {
      return badRequestResponse('userId is required');
    }

    const { data: targetUser, error: userError } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .single();

    if (userError || !targetUser) {
      return notFoundResponse('User not found');
    }

    const { error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: targetUser.email,
    });

    if (linkError) {
      return errorResponse('Failed to generate reset link');
    }

    return jsonResponse({
      success: true,
      email: targetUser.email,
      message: 'Password reset email sent successfully',
    });
  } catch (error) {
    console.error('Error in reset-user-password:', error);
    return errorResponse(error instanceof Error ? error.message : 'Unknown error');
  }
}

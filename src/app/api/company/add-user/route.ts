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

    const { data: roleCheck } = await supabase
      .rpc('has_role', { _user_id: agentId, _role: 'super_admin' });

    if (!roleCheck) {
      return errorResponse('Only super admins can add users to companies', 403);
    }

    const { company_id, email, full_name, phone, role } = await req.json();

    if (!company_id || !email || !full_name || !role) {
      return badRequestResponse('Missing required fields: company_id, email, full_name, role');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return badRequestResponse('Invalid email format');
    }

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, name')
      .eq('id', company_id)
      .single();

    if (companyError || !company) {
      return notFoundResponse('Company not found');
    }

    const { data: newUser, error: createUserError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createUserError) {
      return badRequestResponse(`Failed to create user: ${createUserError.message}`);
    }

    const { error: insertUserError } = await supabase
      .from('users')
      .insert({
        id: newUser.user.id,
        email,
        full_name,
        phone: phone || null,
        company_id,
        is_active: true,
      });

    if (insertUserError) {
      await supabase.auth.admin.deleteUser(newUser.user.id);
      return errorResponse(`Failed to create user profile: ${insertUserError.message}`);
    }

    const { error: roleInsertError } = await supabase
      .from('user_roles')
      .insert({ user_id: newUser.user.id, role, company_id });

    if (roleInsertError) {
      await supabase.from('users').delete().eq('id', newUser.user.id);
      await supabase.auth.admin.deleteUser(newUser.user.id);
      return errorResponse(`Failed to assign role: ${roleInsertError.message}`);
    }

    try {
      await supabase.auth.admin.generateLink({ type: 'recovery', email });
    } catch (emailError) {
      console.error('Error with password reset email:', emailError);
    }

    const { data: createdUser } = await supabase
      .from('users')
      .select('*, user_roles!inner(role)')
      .eq('id', newUser.user.id)
      .single();

    return jsonResponse({
      success: true,
      user: createdUser || {
        id: newUser.user.id,
        email,
        full_name,
        phone,
        company_id,
        user_roles: [{ role }],
      },
    });
  } catch (error: any) {
    console.error('Error in add-user-to-company:', error);
    return errorResponse(error.message || 'Internal server error');
  }
}

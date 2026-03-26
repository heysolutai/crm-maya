import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse, badRequestResponse } from '@/lib/api/cors';

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

    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', agentId)
      .eq('role', 'super_admin')
      .single();

    if (!roles) {
      return errorResponse('Only super admins can create companies', 403);
    }

    const { companyName, ownerEmail, ownerFullName, ownerPassword } = await req.json();

    if (!companyName || !ownerEmail) {
      return badRequestResponse('Company name and owner email are required');
    }

    if (ownerPassword && ownerPassword.length < 8) {
      return badRequestResponse('Password must be at least 8 characters');
    }

    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = (existingUsers as any)?.users?.find((u: any) => u.email?.toLowerCase() === ownerEmail.toLowerCase());

    let ownerId: string;
    let isNewUser = false;

    if (existingUser) {
      const { data: userWithCompany } = await supabase
        .from('users')
        .select('company_id')
        .eq('id', existingUser.id)
        .single();

      if (userWithCompany?.company_id) {
        return badRequestResponse('User already belongs to a company');
      }

      ownerId = existingUser.id;
    } else {
      const { data: newUser, error: createUserError } = await supabase.auth.admin.createUser({
        email: ownerEmail,
        password: ownerPassword || undefined,
        email_confirm: true,
        user_metadata: { full_name: ownerFullName || ownerEmail.split('@')[0] },
      });

      if (createUserError || !newUser.user) {
        return errorResponse('Failed to create owner user', 500, createUserError?.message);
      }

      ownerId = newUser.user.id;
      isNewUser = true;
    }

    await supabase
      .from('users')
      .upsert({
        id: ownerId,
        email: ownerEmail,
        full_name: ownerFullName || ownerEmail.split('@')[0],
      }, { onConflict: 'id', ignoreDuplicates: false });

    const { data: companyId, error: createCompanyError } = await supabase
      .rpc('create_company_with_owner', {
        p_company_name: companyName,
        p_company_email: ownerEmail,
        p_owner_user_id: ownerId,
      });

    if (createCompanyError) {
      if (isNewUser) {
        await supabase.auth.admin.deleteUser(ownerId);
      }
      return errorResponse('Failed to create company', 500, createCompanyError.message);
    }

    if (!ownerPassword && isNewUser) {
      await supabase.auth.admin.generateLink({ type: 'recovery', email: ownerEmail });
    }

    const { data: company } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    return jsonResponse({
      success: true,
      data: {
        companyId,
        company,
        ownerId,
        ownerEmail,
        message: isNewUser
          ? (ownerPassword ? 'Empresa criada com sucesso. Senha definida.' : 'Empresa criada com sucesso. Email de redefinição de senha enviado.')
          : 'Empresa criada com sucesso. Usuário existente associado.',
      },
    });
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return errorResponse('Internal server error', 500, error.message);
  }
}

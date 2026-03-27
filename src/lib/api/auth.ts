import { createAdminClient } from '@/lib/supabase/admin';
import type { AuthResult } from './types';

/**
 * Validates internal service-to-service calls using INTERNAL_API_SECRET.
 */
export function isInternalRequest(req: Request): boolean {
  const internalKey = req.headers.get('x-internal-key');
  const secret = process.env.INTERNAL_API_SECRET;
  return !!secret && !!internalKey && internalKey === secret;
}

/**
 * Authenticate a request via Bearer token or x-api-key.
 * Super admins are allowed through without a company_id.
 */
export async function authenticate(req: Request): Promise<AuthResult> {
  const supabase = createAdminClient();

  const authHeader = req.headers.get('Authorization');
  const apiKey = req.headers.get('x-api-key');

  let agentId: string | null = null;
  let companyId: string | null = null;
  let isSuperAdmin = false;

  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);

    if (!user) {
      throw new Error('Invalid authentication token');
    }

    agentId = user.id;

    // Check if super_admin
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', agentId)
      .eq('role', 'super_admin')
      .maybeSingle();

    if (roles) {
      isSuperAdmin = true;
    }

    // Get company_id (may be null for super_admin)
    const { data: userData } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', agentId)
      .single();

    companyId = userData?.company_id || null;

  } else if (apiKey) {
    const { data: keyData, error } = await supabase
      .from('api_keys')
      .select('company_id, is_active, id')
      .eq('key', apiKey)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !keyData) {
      throw new Error('Invalid or inactive API key');
    }

    companyId = keyData.company_id;

    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyData.id);
  }

  if (!agentId && !companyId) {
    throw new Error('Authentication required: provide Authorization token or x-api-key header');
  }

  return { agentId, companyId, isSuperAdmin };
}

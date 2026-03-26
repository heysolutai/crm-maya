import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse, badRequestResponse } from '@/lib/api/cors';

export async function OPTIONS(req: NextRequest) {
  return handleCors(req) || jsonResponse(null);
}

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req);
    const supabase = createAdminClient();

    const { data: company, error } = await supabase
      .from('companies')
      .select('id, name, settings')
      .eq('id', companyId)
      .single();

    if (error || !company) {
      return errorResponse('Company not found', 404);
    }

    return jsonResponse({ success: true, settings: company.settings });
  } catch (error: any) {
    return errorResponse(error.message);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { agentId, companyId: authCompanyId } = await authenticate(req);
    const supabase = createAdminClient();

    const { company_id, settings } = await req.json();

    if (!settings) {
      return badRequestResponse('settings is required');
    }

    // Determine target company: use company_id from body if super_admin, otherwise use auth company
    let targetCompanyId = authCompanyId;

    if (company_id && company_id !== authCompanyId) {
      // Only super_admin can update other companies
      if (!agentId) {
        return errorResponse('Cannot update other company settings with API key', 403);
      }
      const { data: isSuperAdmin } = await supabase.rpc('has_role', { _user_id: agentId, _role: 'super_admin' });
      if (!isSuperAdmin) {
        return errorResponse('Access denied', 403);
      }
      targetCompanyId = company_id;
    }

    // Merge with existing settings
    const { data: existing } = await supabase
      .from('companies')
      .select('settings')
      .eq('id', targetCompanyId)
      .single();

    const currentSettings = (existing?.settings as Record<string, unknown>) || {};
    const mergedSettings = { ...currentSettings, ...settings };

    const { data: updated, error } = await supabase
      .from('companies')
      .update({ settings: mergedSettings })
      .eq('id', targetCompanyId)
      .select('id, name, settings')
      .single();

    if (error) {
      console.error('[company/settings] Update error:', error);
      return errorResponse('Failed to update settings');
    }

    return jsonResponse({ success: true, settings: updated.settings });
  } catch (error: any) {
    console.error('[company/settings] Error:', error);
    return errorResponse(error.message);
  }
}

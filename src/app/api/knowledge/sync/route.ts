import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse, badRequestResponse, notFoundResponse, unauthorizedResponse } from '@/lib/api/cors';

function normalizeCompanyName(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  console.log('[Sync KB] ▶ Request received');

  try {
    let authResult;
    try {
      authResult = await authenticate(req);
      console.log('[Sync KB] ✅ Authenticated, companyId:', authResult.companyId);
    } catch (authError: any) {
      console.error('[Sync KB] ❌ Authentication failed:', authError.message);
      return unauthorizedResponse('Authentication required');
    }

    const knowledgeWebhookUrl = process.env.KNOWLEDGE_WEBHOOK_URL || process.env.NEXT_PUBLIC_N8N_FAQ_WEBHOOK_URL;
    if (!knowledgeWebhookUrl) {
      console.error('[Sync KB] ❌ No webhook URL configured (KNOWLEDGE_WEBHOOK_URL and NEXT_PUBLIC_N8N_FAQ_WEBHOOK_URL are both empty)');
      return errorResponse('KNOWLEDGE_WEBHOOK_URL not configured');
    }
    console.log('[Sync KB] Webhook URL:', knowledgeWebhookUrl.substring(0, 60) + '...');

    const supabase = createAdminClient();
    const body = await req.json();
    const { company_id } = body;

    if (!company_id) {
      console.error('[Sync KB] ❌ Missing company_id in request body:', body);
      return badRequestResponse('company_id is required');
    }

    if (company_id !== authResult.companyId) {
      // Allow super_admin to sync any company
      if (authResult.agentId) {
        const { data: isSuperAdmin } = await supabase.rpc('has_role', { _user_id: authResult.agentId, _role: 'super_admin' });
        if (!isSuperAdmin) {
          console.error('[Sync KB] ❌ company_id mismatch and not super_admin: body=', company_id, 'auth=', authResult.companyId);
          return jsonResponse({ error: 'Forbidden: company_id mismatch' }, 403);
        }
        console.log('[Sync KB] Super admin syncing different company:', company_id);
      } else {
        console.error('[Sync KB] ❌ company_id mismatch (API key): body=', company_id, 'auth=', authResult.companyId);
        return jsonResponse({ error: 'Forbidden: company_id mismatch' }, 403);
      }
    }

    console.log('[Sync KB] Processing request for company:', company_id);

    const { data: company, error: companyError } = await supabase.from('companies').select('name').eq('id', company_id).single();
    if (companyError || !company) {
      console.error('[Sync KB] ❌ Company not found:', companyError?.message);
      return notFoundResponse('Company not found');
    }

    const knowledgeName = 'know_' + normalizeCompanyName(company.name);
    console.log('[Sync KB] Generated knowledge name:', knowledgeName);

    const { data: faqs, error: faqsError } = await supabase
      .from('company_faqs')
      .select('question, answer, keywords, category')
      .eq('company_id', company_id)
      .eq('is_active', true)
      .order('order_position', { ascending: true });

    if (faqsError) {
      console.error('[Sync KB] ❌ Failed to fetch FAQs:', faqsError.message);
      return errorResponse('Failed to fetch FAQs');
    }

    console.log('[Sync KB] Found', faqs?.length || 0, 'active FAQs');

    const webhookResponse = await fetch(knowledgeWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ knowledge_name: knowledgeName, faqs: faqs || [] }),
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error('[Sync KB] ❌ Webhook failed:', webhookResponse.status, errorText);
      return errorResponse('Failed to sync with Knowledge Base', 500, errorText);
    }

    console.log('[Sync KB] ✅ Webhook sent successfully');

    const { error: updateError } = await supabase.from('ai_configurations').update({ knowledge: knowledgeName }).eq('company_id', company_id).eq('is_active', true);
    if (updateError) console.warn('[Sync KB] ⚠ Failed to update ai_configurations:', updateError);

    console.log('[Sync KB] ✅ Done! knowledge_name:', knowledgeName, 'faqs_count:', faqs?.length || 0);
    return jsonResponse({ success: true, knowledge_name: knowledgeName, faqs_count: faqs?.length || 0 });
  } catch (error: any) {
    console.error('[Sync KB] ❌ Unexpected error:', error.message, error.stack);
    return errorResponse(error.message);
  }
}

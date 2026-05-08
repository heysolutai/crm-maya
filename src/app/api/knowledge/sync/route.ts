import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse, badRequestResponse, notFoundResponse, unauthorizedResponse } from '@/lib/api/cors';
import { handleApiErrorCors } from '@/lib/api/errors'
import { getSystemSetting } from '@/lib/system-settings'

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
    } catch (authError) {
      console.error('[Sync KB] ❌ Authentication failed:', authError);
      return unauthorizedResponse('Authentication required');
    }

    const knowledgeWebhookUrl =
      (await getSystemSetting('knowledge_webhook_url')) ||
      process.env.NEXT_PUBLIC_N8N_FAQ_WEBHOOK_URL;
    if (!knowledgeWebhookUrl) {
      console.error('[Sync KB] ❌ Knowledge webhook URL nao configurada (super-admin > Sistema)');
      return errorResponse('Knowledge webhook URL nao configurada');
    }
    console.log('[Sync KB] Webhook URL:', knowledgeWebhookUrl.substring(0, 60) + '...');

    const body = await req.json();
    const { company_id } = body;

    if (!company_id) {
      console.error('[Sync KB] ❌ Missing company_id in request body:', body);
      return badRequestResponse('company_id is required');
    }

    if (company_id !== authResult.companyId) {
      // Allow super_admin to sync any company
      if (authResult.agentId) {
        const isSuperAdmin = await prisma.userRole.findFirst({
          where: { userId: authResult.agentId, role: 'super_admin' },
        });
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

    const company = await prisma.company.findUnique({
      where: { id: company_id },
      select: { name: true },
    });
    if (!company) {
      console.error('[Sync KB] ❌ Company not found');
      return notFoundResponse('Company not found');
    }

    const knowledgeName = 'know_' + normalizeCompanyName(company.name);
    console.log('[Sync KB] Generated knowledge name:', knowledgeName);

    const faqs = await prisma.companyFaq.findMany({
      where: { companyId: company_id, isActive: true },
      select: { question: true, answer: true, keywords: true, category: true },
      orderBy: { orderPosition: 'asc' },
    });

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

    try {
      await prisma.aiConfiguration.updateMany({
        where: { companyId: company_id, isActive: true },
        data: { knowledge: knowledgeName },
      });
    } catch (updateError) {
      console.warn('[Sync KB] ⚠ Failed to update ai_configurations:', updateError);
    }

    console.log('[Sync KB] ✅ Done! knowledge_name:', knowledgeName, 'faqs_count:', faqs?.length || 0);
    return jsonResponse({ success: true, knowledge_name: knowledgeName, faqs_count: faqs?.length || 0 });
  } catch (error) {
    return handleApiErrorCors(error, '[Sync KB] ❌ Unexpected error')
  }
}

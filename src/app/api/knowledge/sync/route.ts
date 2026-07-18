import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse, badRequestResponse, notFoundResponse, unauthorizedResponse } from '@/lib/api/cors';
import { handleApiErrorCors } from '@/lib/api/errors'
import { getSystemSetting } from '@/lib/system-settings'
// Nome da base vive em um lugar so: o mesmo identificador e usado no webhook do
// n8n, no campo `knowledge` do AiAgent e como nome da tabela no banco vetorial.
import { buildKnowledgeName } from '@/lib/ai/knowledge-name'
import { syncCompanyFaqs } from '@/lib/ai/faq-indexer'

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

    // Webhook do n8n virou OPCIONAL: quem indexa a base vetorial agora e o
    // proprio CRM (syncCompanyFaqs). O webhook segue sendo disparado pra quem
    // depende dele, mas best-effort — n8n fora do ar ou workflow inativo nao
    // pode mais derrubar a sincronizacao.
    const knowledgeWebhookUrl =
      (await getSystemSetting('knowledge_webhook_url')) ||
      process.env.NEXT_PUBLIC_N8N_FAQ_WEBHOOK_URL;
    if (knowledgeWebhookUrl) {
      console.log('[Sync KB] Webhook URL:', knowledgeWebhookUrl.substring(0, 60) + '...');
    } else {
      console.log('[Sync KB] Webhook do n8n nao configurado — seguindo so com a base vetorial');
    }

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

    const knowledgeName = buildKnowledgeName(company.name);
    console.log('[Sync KB] Generated knowledge name:', knowledgeName);

    // Traz tambem id/isActive/updatedAt: o sync incremental precisa deles pra
    // saber o que mudou e o que virou orfao no indice.
    const faqs = await prisma.companyFaq.findMany({
      where: { companyId: company_id, isActive: true },
      select: {
        id: true,
        question: true,
        answer: true,
        keywords: true,
        category: true,
        isActive: true,
        updatedAt: true,
      },
      orderBy: { orderPosition: 'asc' },
    });

    console.log('[Sync KB] Found', faqs?.length || 0, 'active FAQs');

    // 1) Base vetorial (o trabalho de verdade). Incremental: so gera embedding
    //    do que e novo ou mudou; o resto e pulado sem custo de OpenAI.
    const vectorResult = await syncCompanyFaqs(company_id, faqs);
    console.log(
      `[Sync KB] Vetorial: +${vectorResult.added} novos, ~${vectorResult.updated} atualizados, ` +
      `=${vectorResult.skipped} inalterados, -${vectorResult.removed} removidos, ` +
      `${vectorResult.failed} falhas`
    );

    // 2) Webhook do n8n — best-effort. Falha aqui NAO derruba o sync: a base
    //    vetorial ja foi atualizada acima.
    let webhookOk = false;
    if (knowledgeWebhookUrl) {
      try {
        const webhookResponse = await fetch(knowledgeWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ knowledge_name: knowledgeName, faqs: faqs || [] }),
          signal: AbortSignal.timeout(30_000),
        });
        webhookOk = webhookResponse.ok;
        if (!webhookOk) {
          const errorText = await webhookResponse.text();
          console.warn('[Sync KB] ⚠ Webhook n8n falhou (ignorado):', webhookResponse.status, errorText.substring(0, 200));
        } else {
          console.log('[Sync KB] ✅ Webhook n8n enviado');
        }
      } catch (webhookError) {
        console.warn('[Sync KB] ⚠ Webhook n8n inacessivel (ignorado):', (webhookError as Error).message);
      }
    }

    try {
      await prisma.aiAgent.updateMany({
        where: { companyId: company_id, isActive: true },
        data: { knowledge: knowledgeName },
      });
    } catch (updateError) {
      console.warn('[Sync KB] ⚠ Failed to update ai_configurations:', updateError);
    }

    console.log('[Sync KB] ✅ Done! knowledge_name:', knowledgeName, 'faqs_count:', faqs?.length || 0);
    return jsonResponse({
      success: true,
      knowledge_name: knowledgeName,
      faqs_count: faqs?.length || 0,
      vector: vectorResult,
      webhook_sent: webhookOk,
    });
  } catch (error) {
    return handleApiErrorCors(error, '[Sync KB] ❌ Unexpected error')
  }
}

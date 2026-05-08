import { NextRequest } from 'next/server';
import { authenticate } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { handleCors, jsonResponse, errorResponse, badRequestResponse, unauthorizedResponse } from '@/lib/api/cors';
import { handleApiErrorCors } from '@/lib/api/errors'
import { getSystemSetting } from '@/lib/system-settings'

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    let authResult;
    try {
      authResult = await authenticate(req);
    } catch {
      return unauthorizedResponse('Authentication required');
    }

    const webhookUrl =
      (await getSystemSetting('n8n_faq_upload_webhook_url')) ||
      process.env.NEXT_PUBLIC_N8N_FAQ_WEBHOOK_URL;
    if (!webhookUrl) return errorResponse('Webhook não configurado');

    const payload = await req.json();
    if (!payload.fileUrl || !payload.companyId || !payload.fileName) {
      return badRequestResponse('Campos obrigatórios: fileUrl, companyId, fileName');
    }

    if (payload.companyId !== authResult.companyId) {
      // Allow super_admin to upload for any company
      if (authResult.agentId) {
        const isSuperAdmin = await prisma.userRole.findFirst({
          where: { userId: authResult.agentId, role: 'super_admin' },
        });
        if (!isSuperAdmin) {
          return jsonResponse({ error: 'Forbidden: companyId mismatch' }, 403);
        }
      } else {
        return jsonResponse({ error: 'Forbidden: companyId mismatch' }, 403);
      }
    }

    console.log(`Notifying N8N about FAQ upload for company ${payload.companyId}`);

    const n8nResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileUrl: payload.fileUrl,
        companyId: payload.companyId,
        fileName: payload.fileName,
        fileType: payload.fileType || 'unknown',
        fileSize: payload.fileSize || 0,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      console.error(`N8N webhook error: ${n8nResponse.status} - ${errorText}`);
      return jsonResponse({ success: false, error: `Erro ao notificar N8N: ${n8nResponse.status}` }, 502);
    }

    let n8nData;
    try { n8nData = await n8nResponse.json(); } catch { n8nData = { message: 'OK' }; }

    return jsonResponse({ success: true, message: 'Arquivo notificado com sucesso', n8nResponse: n8nData });
  } catch (error) {
    return handleApiErrorCors(error, 'Error in notify-faq-upload')
  }
}

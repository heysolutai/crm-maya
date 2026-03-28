import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse, badRequestResponse } from '@/lib/api/cors';

export async function OPTIONS(req: NextRequest) {
  return handleCors(req) || jsonResponse(null);
}

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req);

    const company = await prisma.company.findUnique({
      where: { id: companyId! },
      select: { id: true, name: true, settings: true },
    });

    if (!company) {
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
      const isSuperAdmin = await prisma.userRole.findFirst({
        where: { userId: agentId, role: 'super_admin' },
      });
      if (!isSuperAdmin) {
        return errorResponse('Access denied', 403);
      }
      targetCompanyId = company_id;
    }

    // Merge with existing settings
    const existing = await prisma.company.findUnique({
      where: { id: targetCompanyId! },
      select: { settings: true },
    });

    const currentSettings = (existing?.settings as Record<string, unknown>) || {};
    const mergedSettings = { ...currentSettings, ...settings };

    const updated = await prisma.company.update({
      where: { id: targetCompanyId! },
      data: { settings: mergedSettings },
      select: { id: true, name: true, settings: true },
    });

    return jsonResponse({ success: true, settings: updated.settings });
  } catch (error: any) {
    console.error('[company/settings] Error:', error);
    return errorResponse(error.message);
  }
}

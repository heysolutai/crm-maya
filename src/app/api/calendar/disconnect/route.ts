import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse, notFoundResponse } from '@/lib/api/cors';

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req);

    const connection = await prisma.googleCalendarConnection.findFirst({
      where: { companyId },
    });
    if (!connection) return notFoundResponse('No Google Calendar connected');

    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${connection.accessToken}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    } catch (e) { console.warn('[Disconnect] Token revoke failed:', e); }

    await prisma.googleCalendarConnection.deleteMany({ where: { companyId } });

    return jsonResponse({ success: true });
  } catch (error: any) {
    return errorResponse(error.message);
  }
}

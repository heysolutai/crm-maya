import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse, badRequestResponse, unauthorizedResponse } from '@/lib/api/cors';
import { handleApiErrorCors } from '@/lib/api/errors'

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    // CRIT-8 fix: requer autenticacao e ignora user_id do body — sempre usa o user da sessao
    const { agentId } = await authenticate(req);
    if (!agentId) return unauthorizedResponse('Authentication required');

    const body = await req.json();
    const { action } = body;

    if (!action) return badRequestResponse('action is required');

    const now = new Date();

    if (action === 'online') {
      await prisma.user.update({
        where: { id: agentId },
        data: { isOnline: true, lastSeenAt: now },
      });

      return jsonResponse({ success: true, status: 'online' });
    }

    if (action === 'offline') {
      await prisma.user.update({
        where: { id: agentId },
        data: { isOnline: false, lastSeenAt: now },
      });

      return jsonResponse({ success: true, status: 'offline' });
    }

    if (action === 'heartbeat') {
      await prisma.user.update({
        where: { id: agentId },
        data: { lastSeenAt: now },
      });

      return jsonResponse({ success: true, status: 'heartbeat' });
    }

    return badRequestResponse('Invalid action. Use: online, offline, or heartbeat');
  } catch (error) {
    return handleApiErrorCors(error, '[Presence] Error')
  }
}

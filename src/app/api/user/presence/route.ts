import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticate, isInternalRequest } from '@/lib/api/auth';
import { handleCors, jsonResponse, errorResponse, badRequestResponse } from '@/lib/api/cors';

export async function OPTIONS(req: NextRequest) { return handleCors(req) || jsonResponse(null); }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, user_id } = body;

    if (!action || !user_id) return badRequestResponse('action and user_id are required');

    const now = new Date();

    if (action === 'online') {
      await prisma.user.update({
        where: { id: user_id },
        data: { isOnline: true, lastSeenAt: now },
      });

      return jsonResponse({ success: true, status: 'online' });
    }

    if (action === 'offline') {
      await prisma.user.update({
        where: { id: user_id },
        data: { isOnline: false, lastSeenAt: now },
      });

      return jsonResponse({ success: true, status: 'offline' });
    }

    if (action === 'heartbeat') {
      await prisma.user.update({
        where: { id: user_id },
        data: { lastSeenAt: now },
      });

      return jsonResponse({ success: true, status: 'heartbeat' });
    }

    return badRequestResponse('Invalid action. Use: online, offline, or heartbeat');
  } catch (error) {
    console.error('[Presence] Error:', error);
    return errorResponse('Erro interno do servidor');
  }
}

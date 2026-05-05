import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse } from '@/lib/api/cors';
import { handleApiErrorCors } from '@/lib/api/errors'

const schema = z.object({
  endpoint: z.string().url(),
});

export async function OPTIONS(req: NextRequest) {
  return handleCors(req) || jsonResponse(null);
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.companyId || !auth.agentId) {
    return jsonResponse({ error: 'Nao autorizado' }, 401);
  }

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse({ error: 'Dados invalidos' }, 400);
    }

    // Deleta apenas se pertencer ao usuario autenticado (IDOR prevention)
    await prisma.pushSubscription.deleteMany({
      where: {
        endpoint: parsed.data.endpoint,
        userId: auth.agentId,
      },
    });

    return jsonResponse({ success: true });
  } catch (error) {
    return handleApiErrorCors(error, '[Push Unsubscribe] erro')
  }
}

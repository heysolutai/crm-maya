import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { authenticate } from '@/lib/api/auth';
import { handleCors, jsonResponse } from '@/lib/api/cors';

const schema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
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

    const { endpoint, keys } = parsed.data;
    const userAgent = req.headers.get('user-agent') || null;

    // Upsert por endpoint unico (evita duplicatas se o mesmo device reinscrever)
    const sub = await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        userId: auth.agentId,
        companyId: auth.companyId,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent,
        lastUsedAt: new Date(),
      },
      create: {
        userId: auth.agentId,
        companyId: auth.companyId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent,
      },
      select: { id: true },
    });

    return jsonResponse({ success: true, id: sub.id });
  } catch (error) {
    console.error('[Push Subscribe] erro:', error);
    return jsonResponse({ error: 'Erro interno do servidor' }, 500);
  }
}

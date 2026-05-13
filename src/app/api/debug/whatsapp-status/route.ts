import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticate } from '@/lib/api/auth';

// Endpoint temporário de diagnóstico — REMOVER APÓS DEBUG
export async function GET(req: NextRequest) {
  try {
    const { companyId, isSuperAdmin } = await authenticate(req);
    
    const instances = await prisma.inbox.findMany({
      where: companyId ? { companyId } : {},
      select: {
        id: true,
        instanceName: true,
        status: true,
        apiUrl: true,
        isActive: true,
        companyId: true,
        metadata: true,
      },
      take: 10,
    });

    return NextResponse.json({
      companyId,
      isSuperAdmin,
      instances: instances.map(i => ({
        ...i,
        // Show first 20 chars of apiUrl only
        apiUrl: i.apiUrl ? i.apiUrl.substring(0, 40) + '...' : null,
        metadata: i.metadata ? Object.keys(i.metadata as object) : null,
      })),
    });
  } catch (error) {
    console.error('[debug/whatsapp-status]', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

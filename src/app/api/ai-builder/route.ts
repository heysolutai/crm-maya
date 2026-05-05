import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const config = await prisma.aiConfiguration.findFirst({
      where: {
        companyId,
        n8nWebhookUrl: { not: null },
      },
      select: { n8nWebhookUrl: true },
    })

    return NextResponse.json({ webhookUrl: config?.n8nWebhookUrl || null })
  } catch (error) {
    return handleApiError(error, 'Erro')}
}

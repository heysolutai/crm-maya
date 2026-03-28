import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const config = await prisma.aiConfiguration.findFirst({
      where: {
        companyId,
        n8nWebhookUrl: { not: null },
      },
      select: { n8nWebhookUrl: true },
    })

    return NextResponse.json({ webhookUrl: config?.n8nWebhookUrl || null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

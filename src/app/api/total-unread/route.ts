import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const cutoffDate = new Date(Date.now() - 48 * 60 * 60 * 1000)

    const count = await prisma.message.count({
      where: {
        senderType: 'client',
        isRead: false,
        createdAt: { gte: cutoffDate },
        conversation: { companyId },
      },
    })

    return NextResponse.json({ count })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

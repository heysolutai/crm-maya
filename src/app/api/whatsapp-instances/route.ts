import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const activeOnly = req.nextUrl.searchParams.get('activeOnly') === 'true'

    const where: any = { companyId }
    if (activeOnly) where.isActive = true

    const instances = await prisma.whatsappInstance.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(instances)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

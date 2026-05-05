import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

export async function GET(req: NextRequest) {
  try {
    await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const [company, users] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId } }),
      prisma.user.findMany({
        where: { companyId },
        include: {
          userRoles: {
            where: { companyId },
            select: { role: true },
          },
        },
      }),
    ])

    return NextResponse.json({ company, users })
  } catch (error) {
    return handleApiError(error, 'Erro')}
}

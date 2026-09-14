import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId, isSuperAdmin } = await authenticate(req)
    const qsCompanyId = req.nextUrl.searchParams.get('companyId')
    // Super-admin pode consultar qualquer restaurante; usuario regular so a propria
    const companyId = isSuperAdmin ? (qsCompanyId || authCompanyId) : authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })

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

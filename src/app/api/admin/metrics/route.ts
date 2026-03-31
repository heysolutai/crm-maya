import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  try {
    const { isSuperAdmin } = await authenticate(req)
    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Super admin access required' }, { status: 403 })
    }

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const [activeCompanies, totalClients, aiMessages, salesData] = await Promise.all([
      prisma.company.count({ where: { isActive: true } }),
      prisma.client.count(),
      prisma.message.count({
        where: { senderType: 'ai', createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.sale.findMany({
        where: { status: 'approved', createdAt: { gte: thirtyDaysAgo } },
        select: { totalAmount: true },
      }),
    ])

    const totalRevenue = salesData.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0)

    return NextResponse.json({
      activeCompanies,
      totalClients,
      aiMessages,
      totalRevenue,
    })
  } catch (error) {
    console.error('Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

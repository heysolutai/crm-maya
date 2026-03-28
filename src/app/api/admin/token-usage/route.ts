import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  try {
    const { isSuperAdmin } = await authenticate(req)
    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Super admin access required' }, { status: 403 })
    }

    const days = parseInt(req.nextUrl.searchParams.get('days') || '30')
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const usageData = await prisma.aiTokenUsage.findMany({
      where: { createdAt: { gte: startDate } },
      include: { company: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    })

    // Calculate totals
    const totalCost = usageData.reduce((sum, row) => sum + Number(row.totalCost), 0)
    const totalTokens = usageData.reduce((sum, row) => sum + row.totalTokens, 0)
    const totalRequests = usageData.length

    // Group by model
    const modelMap = new Map<string, { requests: number; tokens: number; cost: number }>()
    usageData.forEach((row) => {
      const model = row.model || 'unknown'
      const current = modelMap.get(model) || { requests: 0, tokens: 0, cost: 0 }
      modelMap.set(model, {
        requests: current.requests + 1,
        tokens: current.tokens + row.totalTokens,
        cost: current.cost + Number(row.totalCost),
      })
    })

    const byModel = Array.from(modelMap.entries()).map(([model, data]) => ({
      model,
      requests: data.requests,
      totalTokens: data.tokens,
      totalCost: data.cost,
      avgTokensPerRequest: Math.round(data.tokens / data.requests),
    })).sort((a, b) => b.totalCost - a.totalCost)

    // Group by company
    const companyMap = new Map<string, { name: string; requests: number; tokens: number; cost: number }>()
    usageData.forEach((row) => {
      const companyName = row.company?.name || 'Unknown'
      const current = companyMap.get(row.companyId) || { name: companyName, requests: 0, tokens: 0, cost: 0 }
      companyMap.set(row.companyId, {
        name: companyName,
        requests: current.requests + 1,
        tokens: current.tokens + row.totalTokens,
        cost: current.cost + Number(row.totalCost),
      })
    })

    const byCompany = Array.from(companyMap.entries()).map(([companyId, data]) => ({
      companyId,
      companyName: data.name,
      requests: data.requests,
      totalTokens: data.tokens,
      totalCost: data.cost,
    })).sort((a, b) => b.totalCost - a.totalCost)

    // Group by day
    const dailyMap = new Map<string, { cost: number; tokens: number; requests: number }>()
    usageData.forEach((row) => {
      const date = row.createdAt.toISOString().split('T')[0]
      const current = dailyMap.get(date) || { cost: 0, tokens: 0, requests: 0 }
      dailyMap.set(date, {
        cost: current.cost + Number(row.totalCost),
        tokens: current.tokens + row.totalTokens,
        requests: current.requests + 1,
      })
    })

    const dailyUsage = Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return NextResponse.json({
      totalCost,
      totalTokens,
      totalRequests,
      byModel,
      byCompany,
      dailyUsage,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

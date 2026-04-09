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
    const totalInputTokens = usageData.reduce((sum, row) => sum + row.inputTokens, 0)
    const totalOutputTokens = usageData.reduce((sum, row) => sum + row.outputTokens, 0)
    const totalInputCost = usageData.reduce((sum, row) => sum + Number(row.inputCost), 0)
    const totalOutputCost = usageData.reduce((sum, row) => sum + Number(row.outputCost), 0)
    const totalRequests = usageData.length

    // Group by model
    const modelMap = new Map<string, { requests: number; tokens: number; inputTokens: number; outputTokens: number; cost: number; inputCost: number; outputCost: number }>()
    usageData.forEach((row) => {
      const model = row.model || 'unknown'
      const current = modelMap.get(model) || { requests: 0, tokens: 0, inputTokens: 0, outputTokens: 0, cost: 0, inputCost: 0, outputCost: 0 }
      modelMap.set(model, {
        requests: current.requests + 1,
        tokens: current.tokens + row.totalTokens,
        inputTokens: current.inputTokens + row.inputTokens,
        outputTokens: current.outputTokens + row.outputTokens,
        cost: current.cost + Number(row.totalCost),
        inputCost: current.inputCost + Number(row.inputCost),
        outputCost: current.outputCost + Number(row.outputCost),
      })
    })

    const byModel = Array.from(modelMap.entries()).map(([model, data]) => ({
      model,
      requests: data.requests,
      totalTokens: data.tokens,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      totalCost: data.cost,
      inputCost: data.inputCost,
      outputCost: data.outputCost,
      avgTokensPerRequest: Math.round(data.tokens / data.requests),
    })).sort((a, b) => b.totalCost - a.totalCost)

    // Group by company
    const companyMap = new Map<string, { name: string; requests: number; tokens: number; inputTokens: number; outputTokens: number; cost: number }>()
    usageData.forEach((row) => {
      const companyName = row.company?.name || 'Unknown'
      const current = companyMap.get(row.companyId) || { name: companyName, requests: 0, tokens: 0, inputTokens: 0, outputTokens: 0, cost: 0 }
      companyMap.set(row.companyId, {
        name: companyName,
        requests: current.requests + 1,
        tokens: current.tokens + row.totalTokens,
        inputTokens: current.inputTokens + row.inputTokens,
        outputTokens: current.outputTokens + row.outputTokens,
        cost: current.cost + Number(row.totalCost),
      })
    })

    const byCompany = Array.from(companyMap.entries()).map(([companyId, data]) => ({
      companyId,
      companyName: data.name,
      requests: data.requests,
      totalTokens: data.tokens,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      totalCost: data.cost,
    })).sort((a, b) => b.totalCost - a.totalCost)

    // Group by conversation
    const convMap = new Map<string, { companyId: string; companyName: string; requests: number; inputTokens: number; outputTokens: number; cost: number; lastActivity: Date }>()
    usageData.forEach((row) => {
      if (!row.conversationId) return
      const current = convMap.get(row.conversationId) || {
        companyId: row.companyId,
        companyName: row.company?.name || 'Unknown',
        requests: 0, inputTokens: 0, outputTokens: 0, cost: 0,
        lastActivity: row.createdAt,
      }
      convMap.set(row.conversationId, {
        ...current,
        requests: current.requests + 1,
        inputTokens: current.inputTokens + row.inputTokens,
        outputTokens: current.outputTokens + row.outputTokens,
        cost: current.cost + Number(row.totalCost),
        lastActivity: row.createdAt > current.lastActivity ? row.createdAt : current.lastActivity,
      })
    })

    const byConversation = Array.from(convMap.entries()).map(([conversationId, data]) => ({
      conversationId,
      companyId: data.companyId,
      companyName: data.companyName,
      requests: data.requests,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      totalTokens: data.inputTokens + data.outputTokens,
      totalCost: data.cost,
      lastActivity: data.lastActivity.toISOString(),
    })).sort((a, b) => b.totalCost - a.totalCost).slice(0, 50)

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
      totalInputTokens,
      totalOutputTokens,
      totalInputCost,
      totalOutputCost,
      totalRequests,
      byModel,
      byCompany,
      byConversation,
      dailyUsage,
    })
  } catch (error) {
    console.error('Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

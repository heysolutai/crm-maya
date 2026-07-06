import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const startDate = req.nextUrl.searchParams.get('startDate')
    const endDate = req.nextUrl.searchParams.get('endDate')
    const groupBy = req.nextUrl.searchParams.get('groupBy') || 'ad_id' // ad_id | utm_source | utm_campaign | ad_headline

    const dateFilter: any = {}
    if (startDate) dateFilter.gte = new Date(startDate)
    if (endDate) dateFilter.lte = new Date(endDate)

    const where: any = {
      companyId,
      adPlatform: { not: null },
    }
    if (Object.keys(dateFilter).length > 0) where.createdAt = dateFilter

    // Get all clients from ads
    const adClients = await prisma.client.findMany({
      where,
      select: {
        id: true,
        adId: true,
        adHeadline: true,
        adBody: true,
        adMediaUrl: true,
        adSourceUrl: true,
        adPlatform: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        utmContent: true,
        source: true,
        createdAt: true,
        conversations: {
          select: {
            id: true,
            status: true,
          },
        },
        appointments: {
          select: { id: true, status: true },
        },
        sales: {
          select: { id: true, totalAmount: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Aggregate by groupBy field
    const groupField = groupBy === 'utm_source' ? 'utmSource'
      : groupBy === 'utm_campaign' ? 'utmCampaign'
      : groupBy === 'ad_headline' ? 'adHeadline'
      : 'adId'

    const groups: Record<string, {
      key: string
      ad_headline: string | null
      ad_body: string | null
      ad_platform: string | null
      ad_source_url: string | null
      leads: number
      conversations: number
      appointments: number
      sales: number
      revenue: number
      first_lead_at: string | null
      last_lead_at: string | null
    }> = {}

    for (const client of adClients) {
      const key = (client as any)[groupField] || 'unknown'

      if (!groups[key]) {
        groups[key] = {
          key,
          ad_headline: client.adHeadline,
          ad_body: client.adBody,
          ad_platform: client.adPlatform,
          ad_source_url: client.adSourceUrl,
          leads: 0,
          conversations: 0,
          appointments: 0,
          sales: 0,
          revenue: 0,
          first_lead_at: null,
          last_lead_at: null,
        }
      }

      const g = groups[key]
      g.leads++
      g.conversations += client.conversations.length
      g.appointments += client.appointments.filter(a => a.status === 'scheduled' || a.status === 'completed').length
      g.sales += client.sales.filter(s => s.status === 'approved').length
      g.revenue += client.sales
        .filter(s => s.status === 'approved')
        .reduce((sum, s) => sum + (s.totalAmount?.toNumber?.() ?? Number(s.totalAmount) ?? 0), 0)

      const createdStr = client.createdAt.toISOString()
      if (!g.first_lead_at || createdStr < g.first_lead_at) g.first_lead_at = createdStr
      if (!g.last_lead_at || createdStr > g.last_lead_at) g.last_lead_at = createdStr
    }

    const adGroups = Object.values(groups).sort((a, b) => b.leads - a.leads)

    // Summary totals
    const summary = {
      total_leads: adClients.length,
      total_conversations: adClients.reduce((s, c) => s + c.conversations.length, 0),
      total_appointments: adClients.reduce((s, c) => s + c.appointments.filter(a => a.status === 'scheduled' || a.status === 'completed').length, 0),
      total_sales: adClients.reduce((s, c) => s + c.sales.filter(sale => sale.status === 'approved').length, 0),
      total_revenue: adClients.reduce((s, c) => s + c.sales
        .filter(sale => sale.status === 'approved')
        .reduce((sum, sale) => sum + (sale.totalAmount?.toNumber?.() ?? Number(sale.totalAmount) ?? 0), 0), 0),
      unique_ads: new Set(adClients.map(c => c.adId).filter(Boolean)).size,
    }

    return NextResponse.json({ summary, ads: adGroups })
  } catch (e: any) {
    console.error('[ad-tracking] Error:', e)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

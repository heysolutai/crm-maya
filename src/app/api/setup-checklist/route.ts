import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const [aiConfig, company, whatsappInstances, apiKeys, faqs, googleCalendar] = await Promise.all([
      prisma.aiConfiguration.findFirst({
        where: { companyId, isActive: true },
      }),
      prisma.company.findUnique({
        where: { id: companyId },
        select: { settings: true },
      }),
      prisma.whatsappInstance.findMany({
        where: { companyId },
        select: { id: true, status: true, isActive: true },
      }),
      prisma.apiKey.findMany({
        where: { companyId, isActive: true },
        select: { id: true, isActive: true },
      }),
      prisma.companyFaq.findMany({
        where: { companyId, isActive: true },
        select: { id: true, answer: true, isActive: true },
      }),
      prisma.googleCalendarConnection.findFirst({
        where: { companyId, isActive: true },
        select: { id: true, isActive: true },
      }),
    ])

    return NextResponse.json({
      aiConfig,
      company,
      whatsappInstances,
      apiKeys,
      faqs,
      googleCalendar,
    })
  } catch (error) {
    console.error('Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

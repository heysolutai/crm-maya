import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { enqueueCampaignTick } from '@/lib/queue/queues'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
  }

  try {
    const { id } = await params
    const campaign = await prisma.campaign.findFirst({
      where: { id, companyId: auth.companyId },
      select: { id: true, status: true },
    })
    if (!campaign) {
      return NextResponse.json({ error: 'Campanha nao encontrada' }, { status: 404 })
    }
    if (campaign.status !== 'paused') {
      return NextResponse.json(
        { error: `Nao da pra retomar campanha com status "${campaign.status}"` },
        { status: 400 }
      )
    }

    const pendingCount = await prisma.campaignRecipient.count({
      where: { campaignId: id, status: 'pending' },
    })
    if (pendingCount === 0) {
      // Sem pendentes — marca como completed em vez de running
      await prisma.campaign.update({
        where: { id },
        data: { status: 'completed', completedAt: new Date() },
      })
      return NextResponse.json({ success: true, status: 'completed', pendingRecipients: 0 })
    }

    await prisma.campaign.update({
      where: { id },
      data: { status: 'running' },
    })
    await enqueueCampaignTick({ campaignId: id }, 0)

    return NextResponse.json({ success: true, status: 'running', pendingRecipients: pendingCount })
  } catch (error) {
    console.error('Erro ao retomar campanha:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

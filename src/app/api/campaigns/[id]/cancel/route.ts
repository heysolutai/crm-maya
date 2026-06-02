import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { getCampaignTickQueue } from '@/lib/queue/queues'

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
    if (['completed', 'cancelled', 'failed'].includes(campaign.status)) {
      return NextResponse.json(
        { error: `Campanha ja esta em estado final ("${campaign.status}")` },
        { status: 400 }
      )
    }

    // Marca cancelled + zera pending pra skipped (registro do que nao foi enviado)
    await prisma.$transaction([
      prisma.campaignRecipient.updateMany({
        where: { campaignId: id, status: { in: ['pending', 'sending'] } },
        data: { status: 'skipped', errorMessage: 'Campanha cancelada' },
      }),
      prisma.campaign.update({
        where: { id },
        data: { status: 'cancelled', completedAt: new Date() },
      }),
    ])

    // Sync das contagens (recipientsSkipped pode ter aumentado, etc)
    const counts = await prisma.campaignRecipient.groupBy({
      by: ['status'],
      where: { campaignId: id },
      _count: { status: true },
    })
    const skipped = counts.find((c) => c.status === 'skipped')?._count.status || 0
    await prisma.campaign.update({
      where: { id },
      data: { recipientsSkipped: skipped },
    })

    // Remove tick agendado
    try {
      const queue = getCampaignTickQueue()
      const job = await queue.getJob(`campaign:${id}`)
      if (job) await job.remove()
    } catch {
      // noop
    }

    return NextResponse.json({ success: true, status: 'cancelled' })
  } catch (error) {
    console.error('Erro ao cancelar campanha:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

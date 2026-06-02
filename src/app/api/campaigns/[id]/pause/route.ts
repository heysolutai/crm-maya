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
    if (!['running', 'scheduled'].includes(campaign.status)) {
      return NextResponse.json(
        { error: `Nao da pra pausar campanha com status "${campaign.status}"` },
        { status: 400 }
      )
    }

    await prisma.campaign.update({
      where: { id },
      data: { status: 'paused' },
    })

    // Remove tick agendado pra a campanha parar imediatamente
    try {
      const queue = getCampaignTickQueue()
      const job = await queue.getJob(`campaign:${id}`)
      if (job) await job.remove()
    } catch {
      // se nao tinha tick agendado, tudo bem
    }

    return NextResponse.json({ success: true, status: 'paused' })
  } catch (error) {
    console.error('Erro ao pausar campanha:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

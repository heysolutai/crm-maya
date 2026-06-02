import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { enqueueCampaignTick } from '@/lib/queue/queues'

/**
 * Inicia (ou agenda) o disparo de uma campanha.
 *
 * Pre-requisitos:
 *  - Status atual: 'draft' ou 'scheduled' (re-iniciar nao eh suportado aqui;
 *    use /resume pra retomar uma 'paused')
 *  - Tem pelo menos 1 recipient (chame POST /recipients antes)
 *  - Agente vinculado ainda existe e esta conectado (warning, nao bloqueio)
 *
 * Comportamento:
 *  - scheduledFor no passado ou null: status -> 'running', startedAt agora,
 *    enfileira primeiro tick imediato
 *  - scheduledFor no futuro: status -> 'scheduled', enfileira primeiro tick
 *    com delay ate scheduledFor
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
  }

  try {
    const { id } = await params

    const campaign = await prisma.campaign.findFirst({
      where: { id, companyId: auth.companyId },
      include: {
        whatsappInstance: {
          select: { id: true, status: true, displayName: true },
        },
      },
    })
    if (!campaign) {
      return NextResponse.json({ error: 'Campanha nao encontrada' }, { status: 404 })
    }
    if (!['draft', 'scheduled'].includes(campaign.status)) {
      return NextResponse.json(
        { error: `Nao da pra iniciar campanha com status "${campaign.status}". Use resume se estiver paused.` },
        { status: 400 }
      )
    }

    if (!campaign.whatsappInstanceId || !campaign.whatsappInstance) {
      return NextResponse.json(
        { error: 'Campanha sem agente vinculado' },
        { status: 400 }
      )
    }

    const pendingCount = await prisma.campaignRecipient.count({
      where: { campaignId: id, status: 'pending' },
    })
    if (pendingCount === 0) {
      return NextResponse.json(
        { error: 'Nenhum destinatario pendente. Adicione destinatarios antes.' },
        { status: 400 }
      )
    }

    const now = new Date()
    const scheduled = campaign.scheduledFor && campaign.scheduledFor > now
    const delayMs = scheduled ? campaign.scheduledFor!.getTime() - now.getTime() : 0
    const newStatus = scheduled ? 'scheduled' : 'running'

    await prisma.campaign.update({
      where: { id },
      data: {
        status: newStatus,
        startedAt: scheduled ? null : now,
        errorMessage: null,
      },
    })

    // Worker so processa se status === 'running'. Pra status=='scheduled' o tick
    // vai chegar la, ver o status, e o handler ja muda pra running se passar
    // do scheduledFor. Mais simples: setamos 'running' ja se nao tem schedule,
    // e pra scheduled deixamos o handler virar quando o tick chegar.
    // Workaround: pra scheduled, antes do delay terminar, mudamos pra 'running'.
    // Como o codigo do worker so processa 'running', vamos enfileirar com delay
    // e mudar status ANTES do tick rodar via um "warmup" — mais simples eh:
    // se scheduled, criar um job de pre-aquecimento que muda status pra running
    // e enfileira o primeiro tick real. Pra simplificar, mudamos pra running
    // ja se delay <= 60s; pra delays maiores, deixamos como scheduled e o
    // usuario precisa rodar /resume ou esperar... Hmm, isso fica chato.
    //
    // Solucao limpa: salva scheduled, e quando o tick com delay chegar,
    // promove pra running. Vou alterar o worker pra aceitar status='scheduled'
    // tambem como gatilho. Aqui no endpoint, deixo o status conforme a logica
    // acima e enfileiro o tick com o delay correto.
    await enqueueCampaignTick({ campaignId: id }, delayMs)

    return NextResponse.json({
      success: true,
      status: newStatus,
      scheduledFor: campaign.scheduledFor,
      pendingRecipients: pendingCount,
    })
  } catch (error) {
    console.error('Erro ao iniciar campanha:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

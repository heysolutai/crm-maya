import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { isCovercutConfigured, listCovercutNumbers } from '@/lib/channels/covercut'
import { cloudInstanceName } from '@/lib/channels/adapters/whatsapp-cloud'
import { ChannelError } from '@/lib/channels/errors'

/**
 * Numeros conectados na conta WhatsApp Cloud (Covercut) da plataforma.
 *
 * SO super-admin: a lista traz os numeros de TODOS os restaurantes (as
 * credenciais da Covercut sao unicas). Cada item diz se ja esta em uso e por
 * qual restaurante, pra evitar cadastrar o mesmo numero duas vezes.
 */

async function requireSuperAdmin(req: NextRequest): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  const { agentId } = await authenticate(req)
  if (!agentId) {
    return { ok: false, res: NextResponse.json({ error: 'Autenticacao necessaria' }, { status: 403 }) }
  }
  const role = await prisma.userRole.findFirst({
    where: { userId: agentId, role: 'super_admin' },
    select: { id: true },
  })
  if (!role) {
    return { ok: false, res: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }) }
  }
  return { ok: true }
}

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.res

  if (!isCovercutConfigured()) {
    return NextResponse.json({ configured: false, numbers: [] })
  }

  try {
    const numbers = await listCovercutNumbers()
    const inboxes = await prisma.inbox.findMany({
      where: {
        channelType: 'whatsapp_cloud',
        instanceName: { in: numbers.map((n) => cloudInstanceName(n.phone_number_id)) },
      },
      select: { instanceName: true, displayName: true, company: { select: { id: true, name: true } } },
    })
    const byInstance = new Map(inboxes.map((i) => [i.instanceName, i]))

    return NextResponse.json({
      configured: true,
      numbers: numbers.map((n) => {
        const inbox = byInstance.get(cloudInstanceName(n.phone_number_id))
        return {
          phoneNumberId: n.phone_number_id,
          displayPhoneNumber: n.display_phone_number,
          status: n.status ?? null,
          qualityRating: n.quality_rating ?? null,
          inUse: Boolean(inbox),
          companyId: inbox?.company.id ?? null,
          companyName: inbox?.company.name ?? null,
        }
      }),
    })
  } catch (error) {
    if (error instanceof ChannelError) {
      return NextResponse.json({ configured: true, numbers: [], error: error.message }, { status: 502 })
    }
    console.error('[admin/whatsapp-cloud/numbers] erro:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

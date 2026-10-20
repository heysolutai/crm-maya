import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { isCompanyAdmin } from '@/lib/api/company-admin'
import { isCovercutConfigured } from '@/lib/channels/covercut'
import { publicAppBaseUrl, syncCloudNumbers } from '@/lib/channels/cloud-saas'
import { ChannelError } from '@/lib/channels/errors'

/**
 * POST: depois que o pop-up avisa que conectou (ou no botao "Ja conectei"),
 * puxa os numeros da sub-conta do restaurante na Covercut e cria as caixas
 * de entrada que faltam, ja com o webhook configurado.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticate(req)
    if (!auth.companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
    if (!(await isCompanyAdmin(auth))) {
      return NextResponse.json(
        { error: 'Apenas o administrador do restaurante pode conectar o WhatsApp' },
        { status: 403 }
      )
    }
    if (!isCovercutConfigured()) {
      return NextResponse.json({ error: 'WhatsApp Cloud indisponivel no momento' }, { status: 503 })
    }

    const result = await syncCloudNumbers(auth.companyId, publicAppBaseUrl(req))
    return NextResponse.json({
      created: result.created,
      alreadyLinked: result.alreadyLinked,
      conflicts: result.conflicts.length,
      failed: result.failed,
    })
  } catch (error) {
    if (error instanceof ChannelError) {
      return NextResponse.json({ error: error.message }, { status: 502 })
    }
    return handleApiError(error, 'Erro ao sincronizar numeros do WhatsApp Cloud')
  }
}

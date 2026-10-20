import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { isCompanyAdmin } from '@/lib/api/company-admin'
import { isCovercutConfigured } from '@/lib/channels/covercut'
import { createCloudConnectLink } from '@/lib/channels/cloud-saas'
import { ChannelError } from '@/lib/channels/errors'

/**
 * POST -> { url, origin }: link do pop-up de conexao do WhatsApp Cloud (Meta)
 * pro restaurante autenticado. Tambem serve pra "copiar link" e mandar pro
 * dono do numero conectar de outro aparelho.
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

    const link = await createCloudConnectLink(auth.companyId)
    return NextResponse.json({ url: link.url, origin: link.origin })
  } catch (error) {
    if (error instanceof ChannelError) {
      return NextResponse.json({ error: error.message }, { status: 502 })
    }
    return handleApiError(error, 'Erro ao gerar link de conexao')
  }
}

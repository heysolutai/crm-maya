import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { dispatchCompanyReviews, getReviewWebhookUrl } from '@/lib/reviews/dispatch'

/**
 * Disparo MANUAL da avaliacao pro n8n — mesmo fluxo da cron horaria, mas
 * apenas pra empresa autenticada e sob demanda (botao no painel).
 */
export async function POST(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
  }

  try {
    const settings = await prisma.reviewSettings.findUnique({
      where: { companyId: auth.companyId },
      select: { enabled: true },
    })
    if (!settings?.enabled) {
      return NextResponse.json(
        { error: 'Modulo de avaliacao nao esta ativo' },
        { status: 400 }
      )
    }

    const webhookUrl = await getReviewWebhookUrl()
    if (!webhookUrl) {
      return NextResponse.json(
        { error: 'Integracao de avaliacao nao configurada' },
        { status: 503 }
      )
    }

    const result = await dispatchCompanyReviews(auth.companyId, webhookUrl)

    if (result.sent === 0) {
      return NextResponse.json(
        {
          error:
            result.failed > 0
              ? 'Falha ao disparar a avaliacao'
              : 'Nenhum canal qualificado pra disparo (inbox ativo com restaurante vinculado)',
          ...result,
        },
        { status: result.failed > 0 ? 502 : 400 }
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    return handleApiError(error, 'Erro ao disparar avaliacao')
  }
}

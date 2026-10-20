import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

/**
 * O modulo de avaliacao esta ligado pro restaurante autenticado?
 *
 * Endpoint minimo pro menu lateral esconder "Avaliacoes" quando o super-admin
 * ainda nao ativou o modulo. Devolve so o booleano: o conteudo das
 * configuracoes continua em /api/reviews/settings.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
  }

  try {
    const settings = await prisma.reviewSettings.findUnique({
      where: { companyId: auth.companyId },
      select: { enabled: true },
    })

    return NextResponse.json({ enabled: settings?.enabled ?? false })
  } catch (error) {
    return handleApiError(error, 'Erro ao consultar status do modulo de avaliacao')
  }
}

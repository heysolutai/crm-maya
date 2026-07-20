import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

/**
 * Controle do MODULO DE AVALIACAO por empresa — restrito ao super-admin.
 *
 * A empresa configura o conteudo (links/prompts/saudacao) em /api/reviews/settings,
 * mas quem LIGA/DESLIGA o modulo (ReviewSettings.enabled), que habilita a cron
 * diaria pro n8n, e o super-admin.
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

const patchSchema = z.object({
  companyId: z.string().uuid(),
  enabled: z.boolean(),
})

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.res

  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) {
      return NextResponse.json({ error: 'companyId obrigatorio' }, { status: 400 })
    }

    const settings = await prisma.reviewSettings.findUnique({
      where: { companyId },
      select: { enabled: true },
    })

    return NextResponse.json({ companyId, enabled: settings?.enabled ?? false })
  } catch (error) {
    return handleApiError(error, 'Erro ao consultar modulo de avaliacao')
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.res

  try {
    const body = await req.json()
    const validation = patchSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const { companyId, enabled } = validation.data

    // Upsert: garante a linha mesmo se a empresa ainda nao configurou nada.
    const settings = await prisma.reviewSettings.upsert({
      where: { companyId },
      create: { companyId, enabled },
      update: { enabled },
      select: { companyId: true, enabled: true },
    })

    return NextResponse.json(settings)
  } catch (error) {
    return handleApiError(error, 'Erro ao atualizar modulo de avaliacao')
  }
}

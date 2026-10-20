import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { isCompanyAdmin } from '@/lib/api/company-admin'

/**
 * Chaves de settings com formato conhecido. As demais passam como estao
 * (merge raso), pra nao quebrar as telas que ja gravam outras chaves aqui.
 */
const knownSettingsSchema = z
  .object({
    /** Minutos que a IA fica pausada quando um humano responde. 0 = so volta manual. */
    ai_pause_minutes: z.number().int().min(0).max(1440).optional(),
  })
  .passthrough()

const patchSchema = z.object({
  companyId: z.string().uuid().optional(),
  settings: knownSettingsSchema,
})

/** GET company settings */
export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, settings: true },
    })
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    return NextResponse.json(company.settings || {})
  } catch (error) {
    return handleApiError(error, 'Erro')}
}

/**
 * PATCH - Merge-update company settings.
 * Body: { companyId?: string, settings: Record<string, unknown> }
 * The provided settings are shallow-merged into the existing settings JSON.
 */
export async function PATCH(req: NextRequest) {
  try {
    const { companyId: authCompanyId, isSuperAdmin, agentId } = await authenticate(req)
    const body = await req.json()

    // Valida que `settings` e um objeto simples: evita corromper o JSON
    // (spread de string/array) e mass-assignment de tipo inesperado.
    const validation = patchSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const companyId = validation.data.companyId || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    // Non-super-admin can only update their own company
    if (!isSuperAdmin && companyId !== authCompanyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Configuracao da empresa (pausa da IA, permissoes, setup) e decisao do
    // administrador. Antes so as telas escondiam isso: atendente mudava
    // chamando a API direto.
    if (!(await isCompanyAdmin({ agentId, companyId: authCompanyId, isSuperAdmin }))) {
      return NextResponse.json({ error: 'Apenas o administrador pode alterar as configurações' }, { status: 403 })
    }

    // Get current settings
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { settings: true },
    })
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    const currentSettings = (company.settings as Record<string, unknown> | null) || {}
    const newSettings = { ...currentSettings, ...validation.data.settings }

    await prisma.company.update({
      where: { id: companyId },
      data: { settings: newSettings as Prisma.InputJsonValue },
    })

    return NextResponse.json({ success: true, settings: newSettings })
  } catch (error) {
    return handleApiError(error, 'Erro')}
}

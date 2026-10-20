import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { isCompanyAdmin } from '@/lib/api/company-admin'
import { NATIVE_TOOL_NAMES } from '@/lib/ai-tools/native'
import { mergeConfig, parseConfigFields } from '@/lib/ai-tools/secrets'
import { ensureDefaultIntegrations } from '@/lib/ai-tools/seed'
import { asRecord, companySegment, loadIntegrationsState, segmentWhere } from './shared'

/**
 * Tela "Integrações" do restaurante.
 *
 * GET: o que a IA pode fazer (nativas), integrações do catálogo disponíveis
 *      pro segmento e o ID do restaurante de cada conexão.
 * PUT: (admin do restaurante) liga/desliga nativas e configura uma integração.
 */

const putSchema = z
  .object({
    native: z
      .array(z.string().refine((n) => NATIVE_TOOL_NAMES.includes(n), 'Ferramenta desconhecida'))
      .max(50)
      .optional(),
    integration: z
      .object({
        integrationId: z.string().uuid(),
        enabled: z.boolean().optional(),
        config: z.record(z.string().max(64), z.string().max(2000)).optional(),
        enabledTools: z.array(z.string().min(1).max(100)).max(100).optional(),
      })
      .optional(),
  })
  .refine((d) => d.native !== undefined || d.integration !== undefined, { message: 'Nada para salvar' })

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req)
    if (!auth.companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })

    await ensureDefaultIntegrations()
    const state = await loadIntegrationsState(auth.companyId, await isCompanyAdmin(auth), auth.isSuperAdmin === true)
    return NextResponse.json(state)
  } catch (error) {
    return handleApiError(error, 'Erro ao listar integracoes')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await authenticate(req)
    if (!auth.companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
    if (!(await isCompanyAdmin(auth))) {
      return NextResponse.json(
        { error: 'Apenas o administrador do restaurante pode alterar as integrações' },
        { status: 403 }
      )
    }
    const companyId = auth.companyId

    const body: unknown = await req.json().catch(() => null)
    const parsed = putSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const { native, integration } = parsed.data

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { settings: true } })
    if (!company) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 404 })

    if (integration) {
      // Catálogo global: só integrações ativas e do segmento do restaurante.
      const found = await prisma.integration.findFirst({
        where: {
          id: integration.integrationId,
          isActive: true,
          companyId: null,
          ...segmentWhere(companySegment(company.settings)),
        },
        select: {
          id: true,
          configFields: true,
          tools: { where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { name: true } },
        },
      })
      if (!found) return NextResponse.json({ error: 'Integração não encontrada' }, { status: 404 })

      const activeNames = found.tools.map((t) => t.name)
      if (integration.enabledTools?.some((n) => !activeNames.includes(n))) {
        return NextResponse.json({ error: 'Uma das opções escolhidas não existe nesta integração' }, { status: 400 })
      }

      const previous = await prisma.companyIntegration.findUnique({
        where: { companyId_integrationId: { companyId, integrationId: found.id } },
        select: { enabled: true, config: true, enabledTools: true },
      })

      const fields = parseConfigFields(found.configFields)
      const config = mergeConfig(fields, previous?.config, integration.config ?? {})
      const enabled = integration.enabled ?? previous?.enabled ?? false

      // Primeira vez ligando sem escolher nada: a IA pode usar tudo.
      const enabledTools = [
        ...new Set(
          integration.enabledTools ??
            (previous ? previous.enabledTools.filter((n) => activeNames.includes(n)) : enabled ? activeNames : [])
        ),
      ]

      if (enabled) {
        const faltando = fields.filter((f) => f.required && !config[f.key])
        if (faltando.length) {
          return NextResponse.json(
            {
              error: `Preencha ${faltando.length === 1 ? 'o campo' : 'os campos'}: ${faltando.map((f) => f.label).join(', ')}`,
              fields: faltando.map((f) => f.key),
            },
            { status: 400 }
          )
        }
      }

      await prisma.companyIntegration.upsert({
        where: { companyId_integrationId: { companyId, integrationId: found.id } },
        create: { companyId, integrationId: found.id, enabled, config, enabledTools },
        update: { enabled, config, enabledTools },
      })
    }

    if (native) {
      // Mescla no JSON de settings mantendo as outras chaves.
      const settings = { ...asRecord(company.settings), ai_native_tools: [...new Set(native)] }
      await prisma.company.update({
        where: { id: companyId },
        data: { settings: settings as Prisma.InputJsonValue },
      })
    }

    const state = await loadIntegrationsState(companyId, true, auth.isSuperAdmin === true)
    return NextResponse.json(state)
  } catch (error) {
    return handleApiError(error, 'Erro ao salvar integracoes')
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { isCompanyAdmin } from '@/lib/api/company-admin'
import { agoraSaoPaulo } from '@/lib/ai-tools/context'
import { executeTool } from '@/lib/ai-tools/executor'
import { resolveToolForTest } from '@/lib/ai-tools/registry'
import { parseConfigFields } from '@/lib/ai-tools/secrets'
import { renderValue } from '@/lib/ai-tools/template'
import { companySegment, friendlyTestMessage, segmentWhere } from '../shared'

/**
 * POST { integrationId } -> botão "Testar conexão" do restaurante.
 *
 * Roda a ferramenta de teste da integração (só leitura, definida pelo
 * super-admin) com a configuração SALVA do restaurante, guarda o resultado
 * e responde com uma frase simples. O detalhe técnico fica no servidor
 * (CompanyIntegration.lastError e Logs da IA).
 */

const bodySchema = z.object({
  integrationId: z.string().uuid(),
  /** Testa com o ID de restaurante DESTE numero de WhatsApp. */
  inboxId: z.string().uuid().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticate(req)
    if (!auth.companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
    if (!(await isCompanyAdmin(auth))) {
      return NextResponse.json(
        { error: 'Apenas o administrador do restaurante pode testar as integrações' },
        { status: 403 }
      )
    }
    const companyId = auth.companyId

    const body: unknown = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { settings: true } })
    const integration = await prisma.integration.findFirst({
      where: {
        id: parsed.data.integrationId,
        isActive: true,
        companyId: null,
        ...segmentWhere(companySegment(company?.settings)),
      },
      select: { id: true, name: true, configFields: true, testToolName: true, testArgs: true },
    })
    if (!integration) return NextResponse.json({ error: 'Integração não encontrada' }, { status: 404 })
    if (!integration.testToolName) {
      return NextResponse.json({ error: 'Esta integração não tem teste disponível' }, { status: 400 })
    }

    // IDOR: o numero escolhido precisa ser do restaurante.
    const inboxId = parsed.data.inboxId
    if (inboxId) {
      const inbox = await prisma.inbox.findFirst({ where: { id: inboxId, companyId }, select: { id: true } })
      if (!inbox) return NextResponse.json({ error: 'Número de WhatsApp não encontrado' }, { status: 404 })
    }

    let ok = false
    let error: string | null = null

    const tool = await resolveToolForTest(companyId, integration.testToolName)
    // A ferramenta de teste precisa ser desta integração (ou nativa).
    if (!tool || (tool.source === 'integration' && tool.integration?.id !== integration.id)) {
      error = 'ferramenta de teste indisponivel'
    } else {
      try {
        const args = renderValue(integration.testArgs ?? {}, { agora: agoraSaoPaulo() })
        const r = await executeTool({
          companyId,
          conversationId: null,
          name: integration.testToolName,
          rawArgs: args,
          test: { tool, inboxId },
        })
        ok = r.ok
        error = r.ok ? null : r.error || 'falha sem detalhe'
      } catch (err) {
        console.error('[integrations/test] erro ao testar', integration.id, err)
        ok = false
        error = 'erro inesperado no teste'
      }
    }

    const at = new Date()
    await prisma.companyIntegration.upsert({
      where: { companyId_integrationId: { companyId, integrationId: integration.id } },
      create: {
        companyId,
        integrationId: integration.id,
        enabled: false,
        lastTestAt: at,
        lastTestOk: ok,
        lastError: error ? error.slice(0, 1000) : null,
      },
      update: { lastTestAt: at, lastTestOk: ok, lastError: error ? error.slice(0, 1000) : null },
    })

    return NextResponse.json({
      ok,
      message: friendlyTestMessage(ok, error, parseConfigFields(integration.configFields), integration.name),
      at: at.toISOString(),
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao testar integracao')
  }
}

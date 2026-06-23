import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

/**
 * Status dos "Primeiros Passos" do restaurante (checklist do dashboard).
 * Detecta sozinho o que ja foi feito a partir dos dados da empresa.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
  }

  try {
    const companyId = auth.companyId
    const [inboxCount, connectedCount, faqCount, apiKeyCount, agent] = await Promise.all([
      prisma.inbox.count({ where: { companyId } }),
      prisma.inbox.count({ where: { companyId, status: 'connected' } }),
      prisma.companyFaq.count({ where: { companyId } }),
      prisma.apiKey.count({ where: { companyId, isActive: true } }),
      prisma.aiAgent.findFirst({
        where: { companyId, isActive: true },
        select: { prompts: true },
      }),
    ])

    // Agente "configurado" = tem prompts preenchidos (deixou de ser o {} inicial).
    const agentConfigured = !!agent && JSON.stringify(agent.prompts ?? {}) !== '{}'

    return NextResponse.json({
      whatsappConnected: connectedCount > 0,
      whatsappCreated: inboxCount > 0,
      agentConfigured,
      knowledgeAdded: faqCount > 0,
      apiKeyReady: apiKeyCount > 0,
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao buscar status de onboarding')
  }
}

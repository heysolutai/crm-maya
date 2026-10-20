import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { getSystemSetting } from '@/lib/system-settings'
import { getReviewWebhookUrl } from '@/lib/reviews/dispatch'
import { consolidatePrompt } from '@/lib/promptConsolidation'
import type { SetupStatus, SetupAgentStatus, SetupInboxStatus } from '@/components/setup/setup-status'

/**
 * Estado de configuracao do restaurante, pro checklist do setup.
 *
 * Devolve SO booleanos e contagens (nada de prompt, token, URL ou chave): o
 * checklist precisa saber se existe, nao o que e. Antes esta rota devolvia a
 * linha inteira do AiAgent, com as apiKeys em texto puro.
 *
 * Super-admin consulta outro restaurante via `?companyId=` (authenticate
 * resolve a personificacao); usuario comum so enxerga o proprio.
 */

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

const CONNECTED_STATUSES = new Set(['connected', 'open'])

export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
  }
  const companyId = auth.companyId

  try {
    const [
      company,
      inboxes,
      agents,
      faqCount,
      activeApiKeys,
      review,
      globalWebhook,
      defaultAiKey,
      reviewWebhook,
    ] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true, settings: true },
      }),
      prisma.inbox.findMany({
        where: { companyId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          displayName: true,
          instanceName: true,
          channelType: true,
          status: true,
          isActive: true,
          phoneNumber: true,
          channelConfig: true,
          aiAgentId: true,
        },
      }),
      prisma.aiAgent.findMany({
        where: { companyId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          isActive: true,
          prompts: true,
          n8nWebhookUrl: true,
          engine: true,
          apiKeys: true,
          followUpEnabled: true,
          followUpStages: true,
        },
      }),
      prisma.companyFaq.count({
        where: { companyId, isActive: true, NOT: { answer: '' } },
      }),
      prisma.apiKey.count({
        where: {
          companyId,
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
      prisma.reviewSettings.findUnique({
        where: { companyId },
        select: {
          enabled: true,
          dispatchHour: true,
          googleUrl: true,
          tripadvisorUrl: true,
          greeting: true,
          relatorioSemanal: true,
        },
      }),
      getSystemSetting('n8n_ai_webhook_url'),
      getSystemSetting('default_openai_api_key'),
      getReviewWebhookUrl(),
    ])

    if (!company) {
      return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 404 })
    }

    const settings = asRecord(company.settings)
    const businessHours = asRecord(settings.business_hours)
    const setupModes = asRecord(settings.setup_modes)

    const inboxStatus: SetupInboxStatus[] = inboxes.map((inbox) => {
      const restaurantId = asRecord(inbox.channelConfig).restaurantId
      return {
        id: inbox.id,
        name: inbox.displayName || inbox.instanceName,
        channelType: inbox.channelType,
        status: inbox.status,
        isActive: inbox.isActive,
        connected: CONNECTED_STATUSES.has(inbox.status ?? ''),
        phoneNumber: inbox.phoneNumber,
        restaurantId: hasText(restaurantId) ? String(restaurantId).trim() : null,
        aiAgentId: inbox.aiAgentId,
      }
    })

    const agentStatus: SetupAgentStatus[] = agents.map((agent) => {
      const prompts = asRecord(agent.prompts)
      const simple = asRecord(prompts.simple)
      const apiKeys = asRecord(agent.apiKeys)
      const stages = Array.isArray(agent.followUpStages) ? agent.followUpStages : []
      return {
        id: agent.id,
        name: agent.name,
        isActive: agent.isActive,
        hasPrompt: consolidatePrompt(prompts).length > 0,
        hasOwnWebhook: hasText(agent.n8nWebhookUrl),
        engine: agent.engine === 'maestro' ? 'maestro' : 'n8n',
        hasAiApiKey: hasText(apiKeys.openai) || hasText(apiKeys.anthropic) || hasText(apiKeys.gemini),
        followUpReady: agent.followUpEnabled && stages.length > 0,
        hasHours: hasText(simple.hours),
        hasAddress: hasText(simple.address),
      }
    })

    const body: SetupStatus = {
      company: {
        id: company.id,
        name: company.name,
        setupCompleted: settings.setup_completed === true,
        hasBusinessHours: Object.values(businessHours).some((day) => asRecord(day).enabled === true),
        atendimentoMode: typeof setupModes.atendimento === 'boolean' ? setupModes.atendimento : null,
      },
      inboxes: inboxStatus,
      agents: agentStatus,
      faqCount,
      activeApiKeys,
      globalWebhookConfigured: hasText(globalWebhook),
      defaultAiKeyConfigured: hasText(defaultAiKey),
      reviewWebhookConfigured: hasText(reviewWebhook),
      review: review
        ? {
            enabled: review.enabled,
            dispatchHour: review.dispatchHour,
            hasGoogleUrl: hasText(review.googleUrl),
            hasTripadvisorUrl: hasText(review.tripadvisorUrl),
            hasGreeting: hasText(review.greeting),
            relatorioSemanal: review.relatorioSemanal,
          }
        : null,
    }

    return NextResponse.json(body)
  } catch (error) {
    return handleApiError(error, 'Erro ao montar checklist de setup')
  }
}

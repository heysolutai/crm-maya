import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { normalizeCompanySlug, buildAgentMemoryKey } from '@/lib/api/utils'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { handleApiError } from '@/lib/api/errors'
import { redactAiApiKeys, mergeAiApiKeys } from '@/lib/api/redact'
import { logSecurityEvent } from '@/lib/security-log'
import { consolidatePrompt } from '@/lib/promptConsolidation'

/**
 * Normaliza o campo `prompts` do agente pra resposta: consolida os 3 esquemas
 * (prompt_completo / n8n / legado) num unico `prompt_completo` e descarta as
 * chaves espalhadas repetidas. Preserva `simple` (form do modo simples) e
 * `first_message` (boas-vindas), que ainda sao usados por telas.
 *
 * Nao altera o banco — so o formato do retorno. Assim o front sempre recebe o
 * prompt no lugar certo, sem duplicidade.
 */
function normalizePrompts(raw: any): Record<string, unknown> {
  const p = (raw || {}) as Record<string, unknown>
  const out: Record<string, unknown> = { prompt_completo: consolidatePrompt(p) }
  if (typeof p.first_message === 'string' && p.first_message.trim()) {
    out.first_message = p.first_message
  }
  if (p.simple && typeof p.simple === 'object') {
    out.simple = p.simple
  }
  return out
}

// Redige os segredos (apiKeys) e consolida os prompts antes de devolver.
const redactAgent = (a: any) => ({
  ...a,
  apiKeys: redactAiApiKeys(a?.apiKeys),
  prompts: normalizePrompts(a?.prompts),
})

const createAiConfigurationSchema = z.object({
  company_id: z.string().uuid('Invalid company_id format').optional(),
  name: z.string().min(1, 'Name is required'),
  prompts: z.record(z.string(), z.any()).optional(),
  is_active: z.boolean().optional().default(true),
  // Inbox a vincular ao agente IA recem-criado (opcional; agora M:1).
  whatsapp_instance_id: z.string().uuid('Invalid whatsapp_instance_id format').optional(),
  follow_up_stages: z.array(z.any()).optional(),
  follow_up_enabled: z.boolean().optional().default(false),
  api_keys: z.record(z.string(), z.any()).optional(),
  behavior_settings: z.record(z.string(), z.any()).optional(),
  created_by: z.string().optional(),
});

const updateAiConfigurationSchema = z.object({
  id: z.string().uuid('Invalid id format'),
  name: z.string().min(1, 'Name is required').optional(),
  prompts: z.record(z.string(), z.any()).optional(),
  is_active: z.boolean().optional(),
  whatsapp_instance_id: z.string().uuid('Invalid whatsapp_instance_id format').optional().nullable(),
  follow_up_stages: z.array(z.any()).optional(),
  follow_up_enabled: z.boolean().optional(),
  api_keys: z.record(z.string(), z.any()).optional(),
  behavior_settings: z.record(z.string(), z.any()).optional(),
  knowledge: z.any().optional(),
  memory_key: z.string().optional().nullable(),
  products_knowledge: z.string().optional().nullable(),
  n8n_webhook_url: z
    .string()
    .url()
    .refine((v) => {
      // Bloqueia SSRF: nao deixa apontar pra loopback / redes internas.
      try {
        const h = new URL(v).hostname.toLowerCase()
        if (h === 'localhost' || h.endsWith('.localhost') || h === '::1' || h === '[::1]') return false
        if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return false
        if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false
        return true
      } catch {
        return false
      }
    }, 'URL de webhook invalida ou aponta pra rede interna')
    .nullable()
    .optional(),
  conditions: z.any().optional(),
  variables: z.any().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { companyId, agentId: userId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    // Auditoria: registra quem (userId/IP) acessou a config de IA (recurso sensivel).
    await logSecurityEvent({ event: 'access_ai_config', userId, companyId, req })

    // Modo agente. O param `agentId` esta sobrecarregado e pode ser:
    //  (a) id de um AiAgent — tela de detalhe do agente. Agente e SEPARADO do
    //      inbox (uma empresa tem N agentes; cada inbox escolhe qual usar), entao
    //      buscamos o AiAgent direto pelo id.
    //  (b) id de uma Inbox — useInboxAiAgent, que retorna o agente vinculado
    //      aquela inbox (inbox.aiAgentId). Modelo legado de resolucao.
    // IDs de tabelas diferentes nunca colidem (UUID), entao tentamos como
    // AiAgent primeiro e so caimos pra resolucao via inbox se nao achar.
    const agentId = req.nextUrl.searchParams.get('agentId')

    if (agentId) {
      // (a) IDOR-safe: agente direto da empresa
      const directAgent = await prisma.aiAgent.findFirst({
        where: { id: agentId, companyId },
      })
      if (directAgent) return NextResponse.json([redactAgent(directAgent)])

      // (b) Fallback: agentId era na verdade um inboxId — resolve o agente vinculado
      const inbox = await prisma.inbox.findFirst({
        where: { id: agentId, companyId },
        select: { aiAgentId: true },
      })
      if (!inbox?.aiAgentId) return NextResponse.json([])

      const linkedAgent = await prisma.aiAgent.findFirst({
        where: { id: inbox.aiAgentId, companyId },
      })
      return NextResponse.json(linkedAgent ? [redactAgent(linkedAgent)] : [])
    }

    const configurations = await prisma.aiAgent.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(configurations.map(redactAgent))
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId, agentId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    const body = await req.json()
    const validation = createAiConfigurationSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid request data', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }

    const validatedData = validation.data

    const company = await prisma.company.findFirst({
      where: { id: companyId },
      select: { name: true },
    })
    const slug = normalizeCompanySlug(company?.name || '')

    // Se o body informa qual inbox vincular ao novo agente IA, valida ownership
    let inboxToLink: { id: string } | null = null
    if (validatedData.whatsapp_instance_id) {
      const inbox = await prisma.inbox.findFirst({
        where: { id: validatedData.whatsapp_instance_id, companyId },
        select: { id: true },
      })
      if (!inbox) {
        return NextResponse.json({ error: 'Inbox nao encontrado' }, { status: 404 })
      }
      inboxToLink = inbox
    }

    // UUID gerado ANTES do create pra montar a memoryKey ja na criacao
    // (formato <prefixo>_<nome> — sempre existe a partir daqui).
    const aiAgentId = randomUUID()
    const config = await prisma.aiAgent.create({
      data: {
        id: aiAgentId,
        companyId,
        name: validatedData.name,
        prompts: (validatedData.prompts || {}) as Prisma.InputJsonValue,
        isActive: validatedData.is_active,
        followUpStages: (validatedData.follow_up_stages || []) as Prisma.InputJsonValue,
        followUpEnabled: validatedData.follow_up_enabled,
        apiKeys: (validatedData.api_keys || {}) as Prisma.InputJsonValue,
        behaviorSettings: (validatedData.behavior_settings || {}) as Prisma.InputJsonValue,
        createdBy: agentId || validatedData.created_by,
        memoryKey: buildAgentMemoryKey(aiAgentId, validatedData.name),
        knowledge: slug ? `know_${slug}` : null,
        productsKnowledge: slug ? `products_${slug}` : null,
      },
    })

    // Vincula o agente IA recem-criado ao inbox (M:1 — sobrescreve se ja tinha)
    if (inboxToLink) {
      await prisma.inbox.update({
        where: { id: inboxToLink.id },
        data: { aiAgentId: config.id },
      })
    }

    return NextResponse.json(redactAgent(config))
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    const body = await req.json()
    const validation = updateAiConfigurationSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid request data', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }

    const validatedData = validation.data
    const { id, ...updates } = validatedData

    const existing = await prisma.aiAgent.findFirst({
      where: { id, companyId },
    })
    if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

    // Map snake_case to camelCase for known fields
    const data: any = {}
    // Merge (nao substitui) com os prompts atuais do banco. Como o GET agora
    // devolve os prompts consolidados (so prompt_completo/simple/first_message),
    // um replace apagaria as chaves do esquema n8n (papel/objetivo/...) que
    // podem ser lidas por fora. Merge preserva tudo; o consolidatePrompt sempre
    // prioriza o prompt_completo editado, entao a edicao tem efeito.
    if (updates.prompts !== undefined) {
      data.prompts = { ...((existing.prompts as Record<string, unknown>) || {}), ...updates.prompts }
    }
    if (updates.is_active !== undefined) data.isActive = updates.is_active
    if (updates.name !== undefined) data.name = updates.name
    // whatsapp_instance_id agora e gerenciado no Inbox.aiAgentId — body legado e no-op aqui.
    if (updates.follow_up_stages !== undefined) data.followUpStages = updates.follow_up_stages
    if (updates.follow_up_enabled !== undefined) data.followUpEnabled = updates.follow_up_enabled
    // Mescla: chaves que voltaram redigidas (REDACTED) preservam o valor original.
    if (updates.api_keys !== undefined) data.apiKeys = mergeAiApiKeys(updates.api_keys, existing.apiKeys)
    if (updates.behavior_settings !== undefined) data.behaviorSettings = updates.behavior_settings
    if (updates.knowledge !== undefined) data.knowledge = updates.knowledge
    if (updates.memory_key !== undefined) data.memoryKey = updates.memory_key
    if (updates.products_knowledge !== undefined) data.productsKnowledge = updates.products_knowledge
    if (updates.n8n_webhook_url !== undefined) data.n8nWebhookUrl = updates.n8n_webhook_url
    if (updates.conditions !== undefined) data.conditions = updates.conditions
    if (updates.variables !== undefined) data.variables = updates.variables

    const config = await prisma.aiAgent.update({
      where: { id },
      data,
    })

    return NextResponse.json(redactAgent(config))
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const existing = await prisma.aiAgent.findFirst({
      where: { id, companyId },
    })
    if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

    await prisma.aiAgent.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}

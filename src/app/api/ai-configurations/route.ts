import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { normalizeCompanySlug } from '@/lib/api/utils'
import { Prisma } from '@prisma/client'
import { handleApiError } from '@/lib/api/errors'

const createAiConfigurationSchema = z.object({
  company_id: z.string().uuid('Invalid company_id format').optional(),
  name: z.string().min(1, 'Name is required'),
  prompts: z.record(z.string(), z.any()).optional(),
  is_active: z.boolean().optional().default(true),
  whatsapp_instance_id: z.string().uuid('Invalid whatsapp_instance_id format').optional().nullable(),
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
  n8n_webhook_url: z.string().optional(),
  conditions: z.any().optional(),
  variables: z.any().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    // Modo agente: filtra pelo whatsappInstanceId (cada agente tem 1 config)
    const agentId = req.nextUrl.searchParams.get('agentId')

    const where: any = { companyId }
    if (agentId) where.whatsappInstanceId = agentId

    const configurations = await prisma.aiConfiguration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(configurations)
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId: authCompanyId, agentId } = await authenticate(req)
    const body = await req.json()
    const validation = createAiConfigurationSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid request data', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }

    const validatedData = validation.data
    const companyId = validatedData.company_id || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const company = await prisma.company.findFirst({
      where: { id: companyId },
      select: { name: true },
    })
    const slug = normalizeCompanySlug(company?.name || '')

    const config = await prisma.aiConfiguration.create({
      data: {
        companyId,
        name: validatedData.name,
        prompts: (validatedData.prompts || {}) as Prisma.InputJsonValue,
        isActive: validatedData.is_active,
        whatsappInstanceId: validatedData.whatsapp_instance_id || null,
        followUpStages: (validatedData.follow_up_stages || []) as Prisma.InputJsonValue,
        followUpEnabled: validatedData.follow_up_enabled,
        apiKeys: (validatedData.api_keys || {}) as Prisma.InputJsonValue,
        behaviorSettings: (validatedData.behavior_settings || {}) as Prisma.InputJsonValue,
        createdBy: agentId || validatedData.created_by,
        memoryKey: slug ? `memory_${slug}` : null,
        knowledge: slug ? `know_${slug}` : null,
        productsKnowledge: slug ? `products_${slug}` : null,
      },
    })

    return NextResponse.json(config)
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    const body = await req.json()
    const validation = updateAiConfigurationSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid request data', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }

    const validatedData = validation.data
    const { id, ...updates } = validatedData

    const existing = await prisma.aiConfiguration.findFirst({
      where: { id, companyId: companyId! },
    })
    if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

    // Map snake_case to camelCase for known fields
    const data: any = {}
    if (updates.prompts !== undefined) data.prompts = updates.prompts
    if (updates.is_active !== undefined) data.isActive = updates.is_active
    if (updates.name !== undefined) data.name = updates.name
    if (updates.whatsapp_instance_id !== undefined) data.whatsappInstanceId = updates.whatsapp_instance_id
    if (updates.follow_up_stages !== undefined) data.followUpStages = updates.follow_up_stages
    if (updates.follow_up_enabled !== undefined) data.followUpEnabled = updates.follow_up_enabled
    if (updates.api_keys !== undefined) data.apiKeys = updates.api_keys
    if (updates.behavior_settings !== undefined) data.behaviorSettings = updates.behavior_settings
    if (updates.knowledge !== undefined) data.knowledge = updates.knowledge
    if (updates.memory_key !== undefined) data.memoryKey = updates.memory_key
    if (updates.products_knowledge !== undefined) data.productsKnowledge = updates.products_knowledge
    if (updates.n8n_webhook_url !== undefined) data.n8nWebhookUrl = updates.n8n_webhook_url
    if (updates.conditions !== undefined) data.conditions = updates.conditions
    if (updates.variables !== undefined) data.variables = updates.variables

    const config = await prisma.aiConfiguration.update({
      where: { id },
      data,
    })

    return NextResponse.json(config)
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const existing = await prisma.aiConfiguration.findFirst({
      where: { id, companyId: companyId! },
    })
    if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

    await prisma.aiConfiguration.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro')
  }
}

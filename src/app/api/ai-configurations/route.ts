import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const configurations = await prisma.aiConfiguration.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(configurations)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId: authCompanyId, agentId } = await authenticate(req)
    const body = await req.json()
    const companyId = body.company_id || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const config = await prisma.aiConfiguration.create({
      data: {
        companyId,
        name: body.name,
        prompts: body.prompts || {},
        isActive: body.is_active ?? true,
        whatsappInstanceId: body.whatsapp_instance_id || null,
        followUpStages: body.follow_up_stages || [],
        followUpEnabled: body.follow_up_enabled ?? false,
        apiKeys: body.api_keys || {},
        behaviorSettings: body.behavior_settings || {},
        createdBy: agentId || body.created_by,
      },
    })

    return NextResponse.json(config)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await authenticate(req)
    const body = await req.json()
    const { id, ...updates } = body
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    // Convert empty string to null for UUID field
    if ('whatsapp_instance_id' in updates) {
      updates.whatsappInstanceId = updates.whatsapp_instance_id || null
      delete updates.whatsapp_instance_id
    }

    // Map snake_case to camelCase for known fields
    const data: any = {}
    if (updates.prompts !== undefined) data.prompts = updates.prompts
    if (updates.is_active !== undefined) data.isActive = updates.is_active
    if (updates.name !== undefined) data.name = updates.name
    if (updates.whatsappInstanceId !== undefined) data.whatsappInstanceId = updates.whatsappInstanceId
    if (updates.follow_up_stages !== undefined) data.followUpStages = updates.follow_up_stages
    if (updates.follow_up_enabled !== undefined) data.followUpEnabled = updates.follow_up_enabled
    if (updates.api_keys !== undefined) data.apiKeys = updates.api_keys
    if (updates.behavior_settings !== undefined) data.behaviorSettings = updates.behavior_settings
    if (updates.knowledge !== undefined) data.knowledge = updates.knowledge
    if (updates.n8n_webhook_url !== undefined) data.n8nWebhookUrl = updates.n8n_webhook_url
    if (updates.conditions !== undefined) data.conditions = updates.conditions
    if (updates.variables !== undefined) data.variables = updates.variables

    const config = await prisma.aiConfiguration.update({
      where: { id },
      data,
    })

    return NextResponse.json(config)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await authenticate(req)
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    await prisma.aiConfiguration.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

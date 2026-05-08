import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { CHANNEL_TYPES } from '@/lib/channels/types'
import { z } from 'zod'

const upsertSchema = z.object({
  channelType: z.enum(CHANNEL_TYPES),
  serverUrl: z.string().url('URL invalida'),
  serverApiKey: z.string().min(1, 'Token obrigatorio'),
})

function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return '••••••'
  return `••••${key.slice(-4)}`
}

function mapCredential(c: any, options: { reveal?: boolean } = {}) {
  return {
    id: c.id,
    company_id: c.companyId,
    channel_type: c.channelType,
    server_url: c.serverUrl,
    server_api_key: options.reveal ? c.serverApiKey : maskKey(c.serverApiKey),
    has_credential: true,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  }
}

/**
 * GET /api/channel-credentials
 *   Lista credenciais salvas (token mascarado).
 *
 * GET /api/channel-credentials?channelType=uazapi&reveal=1
 *   Retorna credencial especifica. `reveal=1` retorna o token em plano —
 *   so usado pelo POST /api/agents internamente quando precisamos provisionar.
 */
export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    const channelType = req.nextUrl.searchParams.get('channelType')
    const reveal = req.nextUrl.searchParams.get('reveal') === '1'

    if (channelType) {
      const credential = await prisma.channelCredential.findUnique({
        where: { companyId_channelType: { companyId, channelType } },
      })
      if (!credential) return NextResponse.json(null)
      return NextResponse.json(mapCredential(credential, { reveal }))
    }

    const credentials = await prisma.channelCredential.findMany({
      where: { companyId },
      orderBy: { channelType: 'asc' },
    })
    return NextResponse.json(credentials.map((c) => mapCredential(c)))
  } catch (error) {
    return handleApiError(error, 'Erro ao buscar credenciais')
  }
}

/**
 * POST /api/channel-credentials
 *   Upsert por (companyId, channelType). Body: { channelType, serverUrl, serverApiKey }
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    const body = await req.json()
    const validation = upsertSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { channelType, serverUrl, serverApiKey } = validation.data

    const credential = await prisma.channelCredential.upsert({
      where: { companyId_channelType: { companyId, channelType } },
      create: { companyId, channelType, serverUrl, serverApiKey },
      update: { serverUrl, serverApiKey },
    })

    return NextResponse.json(mapCredential(credential), { status: 201 })
  } catch (error) {
    return handleApiError(error, 'Erro ao salvar credencial')
  }
}

/**
 * DELETE /api/channel-credentials?channelType=uazapi
 *   Remove a credencial. Nao mexe nos agentes ja criados — eles continuam
 *   funcionando com o token que ja gravaram.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    const channelType = req.nextUrl.searchParams.get('channelType')
    if (!channelType) return NextResponse.json({ error: 'channelType obrigatorio' }, { status: 400 })

    await prisma.channelCredential.deleteMany({
      where: { companyId, channelType },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro ao remover credencial')
  }
}

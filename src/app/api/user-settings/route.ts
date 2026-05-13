import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

/** GET user settings — usuario regular so le as proprias; super-admin pode ler qualquer */
export async function GET(req: NextRequest) {
  try {
    const { companyId, agentId, isSuperAdmin } = await authenticate(req)
    const requestedUserId = req.nextUrl.searchParams.get('userId')
    if (!requestedUserId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    // IDOR: regular user so consulta o proprio settings
    if (!isSuperAdmin && requestedUserId !== agentId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Super-admin: garantir que o usuario pertence a empresa autenticada
    const user = await prisma.user.findFirst({
      where: isSuperAdmin
        ? { id: requestedUserId }
        : { id: requestedUserId, companyId: companyId! },
      select: { settings: true },
    })
    return NextResponse.json(user?.settings || {})
  } catch (error) {
    return handleApiError(error, 'Erro')}
}

/**
 * PATCH - Merge-update user settings. Usuario so atualiza o proprio.
 * Body: { userId: string, settings: Record<string, any> }
 */
export async function PATCH(req: NextRequest) {
  try {
    const { companyId, agentId, isSuperAdmin } = await authenticate(req)
    const body = await req.json()
    const { userId: requestedUserId, settings } = body

    if (!requestedUserId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    // IDOR: regular user so atualiza o proprio settings
    if (!isSuperAdmin && requestedUserId !== agentId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const user = await prisma.user.findFirst({
      where: isSuperAdmin
        ? { id: requestedUserId }
        : { id: requestedUserId, companyId: companyId! },
      select: { settings: true },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const currentSettings = (user.settings as Record<string, any>) || {}
    const newSettings = { ...currentSettings, ...settings }

    await prisma.user.update({
      where: { id: requestedUserId },
      data: { settings: newSettings },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro')}
}

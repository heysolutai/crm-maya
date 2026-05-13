import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })

    const connection = await prisma.googleCalendarConnection.findFirst({
      where: { companyId },
    })

    return NextResponse.json(connection)
  } catch (error) {
    return handleApiError(error, 'Erro')}
}

export async function PUT(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    const body = await req.json()
    const { id, ...updates } = body
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    // IDOR: garantir que a conexao pertence a esta empresa
    const existing = await prisma.googleCalendarConnection.findFirst({
      where: { id, companyId },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Conexao nao encontrada' }, { status: 404 })
    }

    // Whitelist de campos permitidos (impede mass-assignment de tokens via body)
    const allowedUpdates: Record<string, unknown> = {}
    if (typeof updates.isActive === 'boolean') allowedUpdates.isActive = updates.isActive
    if (typeof updates.calendarId === 'string') allowedUpdates.calendarId = updates.calendarId
    if (typeof updates.calendarName === 'string') allowedUpdates.calendarName = updates.calendarName

    await prisma.googleCalendarConnection.update({
      where: { id },
      data: allowedUpdates,
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro')}
}

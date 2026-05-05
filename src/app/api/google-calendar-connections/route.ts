import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const connection = await prisma.googleCalendarConnection.findFirst({
      where: { companyId },
    })

    return NextResponse.json(connection)
  } catch (error) {
    return handleApiError(error, 'Erro')}
}

export async function PUT(req: NextRequest) {
  try {
    await authenticate(req)
    const body = await req.json()
    const { id, ...updates } = body
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    await prisma.googleCalendarConnection.update({ where: { id }, data: updates })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro')}
}

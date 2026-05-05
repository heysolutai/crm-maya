import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

export async function GET(req: NextRequest) {
  try {
    await authenticate(req)
    const clientId = req.nextUrl.searchParams.get('clientId')
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const conversation = await prisma.conversation.findFirst({
      where: { clientId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    })

    return NextResponse.json(conversation)
  } catch (error) {
    return handleApiError(error, 'Erro')}
}

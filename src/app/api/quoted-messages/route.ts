import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

export async function GET(req: NextRequest) {
  try {
    await authenticate(req)
    const uazMessageId = req.nextUrl.searchParams.get('uazMessageId')
    if (!uazMessageId) return NextResponse.json({ error: 'Missing uazMessageId' }, { status: 400 })

    const message = await prisma.message.findFirst({
      where: { uazMessageId },
      include: {
        sender: { select: { fullName: true } },
      },
    })

    if (!message) return NextResponse.json(null)
    return NextResponse.json(message)
  } catch (error) {
    return handleApiError(error, 'Erro')}
}

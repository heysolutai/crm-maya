import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

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
    console.error('Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

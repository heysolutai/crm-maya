import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    const uazMessageId = req.nextUrl.searchParams.get('uazMessageId')
    if (!uazMessageId) return NextResponse.json({ error: 'Missing uazMessageId' }, { status: 400 })

    // IDOR: garante que a mensagem pertence a uma conversa da empresa
    const message = await prisma.message.findFirst({
      where: { uazMessageId, conversation: { companyId } },
      include: {
        sender: { select: { fullName: true } },
      },
    })

    if (!message) return NextResponse.json(null)
    return NextResponse.json(message)
  } catch (error) {
    return handleApiError(error, 'Erro')}
}

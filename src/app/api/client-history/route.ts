import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    const clientId = req.nextUrl.searchParams.get('clientId')
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    // IDOR: garante que o cliente pertence a empresa
    const client = await prisma.client.findFirst({
      where: { id: clientId, companyId },
      select: { id: true },
    })
    if (!client) {
      return NextResponse.json({ error: 'Cliente nao encontrado' }, { status: 404 })
    }

    const history = await prisma.clientFunnelHistory.findMany({
      where: { clientId },
      include: {
        stage: { select: { name: true, color: true } },
        mover: { select: { fullName: true, email: true } },
      },
      orderBy: { enteredAt: 'desc' },
    })

    return NextResponse.json(history)
  } catch (error) {
    return handleApiError(error, 'Erro')}
}

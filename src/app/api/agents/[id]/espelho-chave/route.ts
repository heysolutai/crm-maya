import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { encryptSecret } from '@/lib/ai-tools/secrets'
import { gerarChaveEspelho } from '@/lib/channels/espelho'

/**
 * Gera uma chave NOVA pra conexao Espelho (a anterior para de valer na hora).
 * A chave volta em texto puro so nesta resposta; no banco fica cifrada.
 * So super-admin.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { companyId, isSuperAdmin } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'So a equipe Maya gera chave de conexao espelho.' }, { status: 403 })
    }

    const { id } = await params
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: 'Conexao nao encontrada' }, { status: 404 })
    }
    const inbox = await prisma.inbox.findFirst({
      where: { id, companyId, channelType: 'espelho' },
      select: { id: true },
    })
    if (!inbox) return NextResponse.json({ error: 'Conexao nao encontrada' }, { status: 404 })

    const chave = gerarChaveEspelho()
    await prisma.inbox.update({ where: { id: inbox.id }, data: { instanceApiKey: encryptSecret(chave) } })
    return NextResponse.json({ chave })
  } catch (error) {
    return handleApiError(error, 'Erro ao gerar a chave do espelho')
  }
}

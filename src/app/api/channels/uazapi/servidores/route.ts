import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { servidoresUazapi } from '@/lib/channels/uazapi-servidores'

/**
 * Servidores UazAPI pra escolher no "Usar token existente" (o `padrao` ja vem
 * preenchido). So enderecos publicos: nenhum token sai daqui.
 */
export async function GET(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
    return NextResponse.json({ servidores: servidoresUazapi() })
  } catch (error) {
    return handleApiError(error, 'Erro ao listar servidores UazAPI')
  }
}

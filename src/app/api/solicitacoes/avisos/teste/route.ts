import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { isCompanyAdmin } from '@/lib/api/company-admin'
import { enviarAvisoDeTeste, resultadoEmTexto } from '@/lib/solicitacoes/avisos'

/**
 * "Enviar teste": manda um aviso de exemplo com a configuracao SALVA do funil,
 * para o admin conferir se chega no WhatsApp da equipe.
 */

const schema = z.object({ funil: z.enum(['eventos', 'atendimento']) })

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticate(req)
    const companyId = auth.companyId
    if (!companyId) return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
    if (!(await isCompanyAdmin(auth))) {
      return NextResponse.json({ error: 'Apenas o administrador do restaurante pode testar os avisos' }, { status: 403 })
    }
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'Funil invalido' }, { status: 400 })

    const config = await prisma.handoffNotify.findUnique({
      where: { companyId_funnel: { companyId, funnel: parsed.data.funil } },
    })
    if (!config || !config.phones.length) {
      return NextResponse.json({ error: 'Salve pelo menos um número antes de testar' }, { status: 400 })
    }

    const r = await enviarAvisoDeTeste(companyId, parsed.data.funil, config)
    return NextResponse.json({ ok: r.enviados.length > 0 && !r.falhas.length, mensagem: resultadoEmTexto(r) })
  } catch (error) {
    return handleApiError(error, 'Erro ao testar o aviso')
  }
}

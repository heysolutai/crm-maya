import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { resumoSmtp, emailConfigurado } from '@/lib/email/config'
import { verificarSmtp, enviarEmail, motivoLegivel } from '@/lib/email/transport'
import { emailTeste } from '@/lib/email/templates'

/**
 * Diagnostico do SMTP: restrito ao super-admin.
 *
 * GET  — como o servidor esta configurado e se a conexao responde.
 * POST — manda um e-mail de teste pro endereco informado.
 *
 * O teste sai DIRETO, sem passar pela fila, de proposito: quem clicou quer
 * saber agora se o SMTP funciona, e nao descobrir num log meia hora depois.
 */

async function requireSuperAdmin(req: NextRequest): Promise<{ ok: true; userId: string } | { ok: false; res: NextResponse }> {
  const { agentId } = await authenticate(req)
  if (!agentId) {
    return { ok: false, res: NextResponse.json({ error: 'Autenticacao necessaria' }, { status: 403 }) }
  }
  const role = await prisma.userRole.findFirst({
    where: { userId: agentId, role: 'super_admin' },
    select: { id: true },
  })
  if (!role) {
    return { ok: false, res: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }) }
  }
  return { ok: true, userId: agentId }
}

const testeSchema = z.object({
  para: z.string().email('E-mail invalido'),
})

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.res

  try {
    const resumo = resumoSmtp()
    if (!resumo.configurado) {
      return NextResponse.json({
        ...resumo,
        conexao: { ok: false, motivo: 'SMTP nao configurado (defina SMTP_HOST e SMTP_FROM)' },
      })
    }

    const conexao = await verificarSmtp()
    return NextResponse.json({ ...resumo, conexao })
  } catch (error) {
    console.error('Erro ao consultar diagnostico de e-mail:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.res

  try {
    const body = await req.json()
    const validation = testeSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    if (!emailConfigurado()) {
      return NextResponse.json(
        { error: 'SMTP nao configurado. Preencha SMTP_HOST e SMTP_FROM no ambiente.' },
        { status: 400 }
      )
    }

    const quem = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { email: true },
    })

    const montado = emailTeste({ enviadoPor: quem?.email || 'super admin', quando: new Date() })

    try {
      await enviarEmail({
        para: validation.data.para,
        assunto: montado.assunto,
        html: montado.html,
        texto: montado.texto,
      })
    } catch (envioError) {
      // O erro cru do SMTP fica so no log: ele traz resposta do servidor e as
      // vezes o usuario da conta. A tela recebe o motivo ja traduzido.
      console.error('[Email] Falha no envio de teste:', envioError)
      return NextResponse.json({ error: motivoLegivel(envioError) }, { status: 502 })
    }

    return NextResponse.json({ success: true, message: `E-mail de teste enviado para ${validation.data.para}` })
  } catch (error) {
    console.error('Erro ao enviar e-mail de teste:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

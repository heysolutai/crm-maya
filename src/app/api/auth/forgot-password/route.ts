import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { criarAuthToken, VALIDADE_RECUPERACAO_MINUTOS } from '@/lib/auth-tokens'
import { emailRecuperarSenha } from '@/lib/email/templates'
import { emailConfigurado, urlDaAplicacao } from '@/lib/email/config'
import { enviarEmail } from '@/lib/email/transport'
import { enqueueEmail } from '@/lib/queue'
import { logSecurityEvent } from '@/lib/security-log'

/**
 * "Esqueci minha senha": manda o link de redefinicao pro e-mail informado.
 *
 * A resposta e SEMPRE a mesma, exista ou nao o e-mail cadastrado. Responder
 * "esse e-mail nao existe" entregaria de graca a lista de quem tem conta aqui
 * pra quem quisesse testar enderecos em massa.
 */

const schema = z.object({
  email: z.string().email('E-mail invalido'),
})

/** Uma pessoa nao precisa de dois links em menos de dois minutos. */
const INTERVALO_MINIMO_MS = 2 * 60 * 1000

const RESPOSTA_PADRAO = {
  message: 'Se este e-mail estiver cadastrado, o link de redefinicao chegara em instantes.',
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const validation = schema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const email = validation.data.email.toLowerCase().trim()

    await logSecurityEvent({ event: 'password_reset_requested', email, req })

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, fullName: true, isActive: true },
    })

    // Daqui pra baixo, qualquer desistencia devolve a MESMA resposta de sucesso.
    if (!user || !user.isActive) {
      return NextResponse.json(RESPOSTA_PADRAO)
    }

    if (!emailConfigurado()) {
      console.error('[Forgot Password] SMTP nao configurado: link nao foi enviado para', email)
      return NextResponse.json(RESPOSTA_PADRAO)
    }

    // Freio contra quem fica clicando (ou martelando a rota): se ja existe um
    // link recente e valido, nao geramos outro.
    const recente = await prisma.authToken.findFirst({
      where: {
        userId: user.id,
        type: 'password_reset',
        usedAt: null,
        expiresAt: { gt: new Date() },
        createdAt: { gt: new Date(Date.now() - INTERVALO_MINIMO_MS) },
      },
      select: { id: true },
    })
    if (recente) {
      return NextResponse.json(RESPOSTA_PADRAO)
    }

    const token = await criarAuthToken(
      user.id,
      'password_reset',
      VALIDADE_RECUPERACAO_MINUTOS * 60 * 1000
    )

    const montado = emailRecuperarSenha({
      nome: user.fullName,
      link: `${urlDaAplicacao()}/auth/reset-password?token=${encodeURIComponent(token)}`,
      validadeMinutos: VALIDADE_RECUPERACAO_MINUTOS,
    })

    try {
      await enqueueEmail({
        para: user.email,
        assunto: montado.assunto,
        html: montado.html,
        texto: montado.texto,
        tipo: 'recuperacao',
      })
    } catch (filaError) {
      // Redis fora do ar nao pode impedir alguem de recuperar a conta.
      console.error('[Forgot Password] Fila indisponivel, enviando direto:', filaError)
      await enviarEmail({
        para: user.email,
        assunto: montado.assunto,
        html: montado.html,
        texto: montado.texto,
      })
    }

    return NextResponse.json(RESPOSTA_PADRAO)
  } catch (error) {
    console.error('Erro ao processar pedido de recuperacao de senha:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

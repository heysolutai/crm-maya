import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { consumirAuthToken, invalidarTokensDoUsuario, lerAuthToken } from '@/lib/auth-tokens'
import { logSecurityEvent } from '@/lib/security-log'

/**
 * Define a senha a partir do link mandado por e-mail.
 *
 * Serve tanto pra recuperacao ("esqueci minha senha") quanto pro convite de
 * acesso: nos dois casos a pessoa chega com um token de uso unico e escolhe
 * uma senha. O GET so diz se o link ainda vale, pra tela nao pedir a senha
 * pra quem clicou num link vencido.
 */

const schema = z.object({
  token: z.string().min(1, 'Token obrigatorio'),
  password: z.string().min(6, 'A senha deve ter ao menos 6 caracteres').max(200),
})

const LINK_INVALIDO = 'Link invalido ou expirado. Peca um novo.'

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token') || ''
    const valido = await lerAuthToken(token)

    if (!valido) {
      return NextResponse.json({ valido: false, error: LINK_INVALIDO }, { status: 400 })
    }

    return NextResponse.json({
      valido: true,
      tipo: valido.type,
      email: valido.email,
      nome: valido.nome,
    })
  } catch (error) {
    console.error('Erro ao validar token de senha:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
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

    const { token, password } = validation.data

    // Gasta o token ANTES de mexer na senha: o mesmo link nao serve duas vezes.
    const valido = await consumirAuthToken(token)
    if (!valido) {
      return NextResponse.json({ error: LINK_INVALIDO }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    await prisma.user.update({
      where: { id: valido.userId },
      data: { passwordHash },
    })

    // Qualquer outro link pendente dessa conta morre junto: se alguem tinha
    // pedido a recuperacao de ma-fe, o link dele nao vale mais.
    await invalidarTokensDoUsuario(valido.userId)

    await logSecurityEvent({
      event: 'password_reset_completed',
      userId: valido.userId,
      email: valido.email,
      req,
    })

    return NextResponse.json({
      success: true,
      email: valido.email,
      message: 'Senha definida com sucesso. Voce ja pode entrar.',
    })
  } catch (error) {
    console.error('Erro ao redefinir senha:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { randomBytes } from 'crypto'

// Self-signup de restaurante: cria usuario + empresa + role (company_admin) +
// API key, tudo de uma vez. O dono cai direto no dashboard com a checklist.
const schema = z.object({
  email: z.string().email('Email invalido'),
  password: z.string().min(6, 'A senha deve ter ao menos 6 caracteres'),
  fullName: z.string().optional(),
  companyName: z.string().min(1, 'Informe o nome do restaurante'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validation = schema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0]?.message || 'Dados invalidos' },
        { status: 400 }
      )
    }

    const { password, fullName, companyName } = validation.data
    const email = validation.data.email.toLowerCase()

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'Este email ja esta cadastrado' }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(password, 12)

    // 1) Cria o usuario dono
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: fullName?.trim() || email.split('@')[0],
      },
    })

    // 2) Cria a empresa + vincula o dono como company_admin. Se falhar, desfaz o usuario.
    try {
      const company = await prisma.company.create({
        data: { name: companyName.trim(), email },
      })
      await prisma.user.update({ where: { id: user.id }, data: { companyId: company.id } })
      await prisma.userRole.create({
        data: { userId: user.id, role: 'company_admin', companyId: company.id },
      })

      // 3) API key da empresa ja nasce pronta (best-effort — nao quebra o cadastro).
      try {
        await prisma.apiKey.create({
          data: {
            companyId: company.id,
            name: 'API padrão',
            key: `rm_${randomBytes(24).toString('hex')}`,
            isActive: true,
            createdBy: user.id,
          },
        })
      } catch (apiKeyError) {
        console.error('[Signup] Falha ao auto-criar API key:', apiKeyError)
      }
    } catch (companyError) {
      console.error('[Signup] Falha ao criar empresa, desfazendo usuario:', companyError)
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {})
      return NextResponse.json({ error: 'Erro ao criar a conta' }, { status: 500 })
    }

    return NextResponse.json({ id: user.id, email: user.email }, { status: 201 })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'Este email ja esta cadastrado' }, { status: 409 })
    }
    console.error('[Register] Error:', error)
    return NextResponse.json({ error: 'Erro interno ao criar conta' }, { status: 500 })
  }
}

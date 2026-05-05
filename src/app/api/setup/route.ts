import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { handleApiError } from '@/lib/api/errors'

// GET — Check if system needs setup (no users exist)
export async function GET() {
  try {
    const userCount = await prisma.user.count()
    return NextResponse.json({ needsSetup: userCount === 0 })
  } catch (error) {
    console.error('Erro:', error);
    // If database is not ready, needs setup
    return NextResponse.json({ needsSetup: true, dbError: true })
  }
}

// POST — Create the first super admin + optional company
export async function POST(request: NextRequest) {
  try {
    // Block if users already exist
    const userCount = await prisma.user.count()
    if (userCount > 0) {
      return NextResponse.json(
        { error: 'Sistema já foi configurado. Não é possível criar outro super admin por aqui.' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { email, password, fullName, companyName, companyEmail } = body

    if (!email || !password || !fullName) {
      return NextResponse.json(
        { error: 'Email, senha e nome completo são obrigatórios' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'A senha deve ter no mínimo 6 caracteres' },
        { status: 400 }
      )
    }

    const passwordHash = await bcrypt.hash(password, 12)

    // Create super admin user
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        isActive: true,
      },
    })

    // Assign super_admin role
    await prisma.userRole.create({
      data: {
        userId: user.id,
        role: 'super_admin',
      },
    })

    // Create first company if provided
    let company = null
    if (companyName) {
      company = await prisma.company.create({
        data: {
          name: companyName,
          email: companyEmail || email,
          isActive: true,
          subscriptionStatus: 'active',
        },
      })

      // Link user to company
      await prisma.user.update({
        where: { id: user.id },
        data: { companyId: company.id },
      })

      // Also give company_admin role for this company
      await prisma.userRole.create({
        data: {
          userId: user.id,
          companyId: company.id,
          role: 'company_admin',
        },
      })

      // Create default funnel stages
      const defaultStages = [
        { name: 'Novo Lead', color: '#3b82f6', orderPosition: 0, isDefault: true },
        { name: 'Qualificado', color: '#8b5cf6', orderPosition: 1 },
        { name: 'Proposta', color: '#f59e0b', orderPosition: 2 },
        { name: 'Negociação', color: '#10b981', orderPosition: 3 },
        { name: 'Fechado', color: '#06b6d4', orderPosition: 4, isFinal: true },
      ]

      for (const stage of defaultStages) {
        await prisma.funnelStage.create({
          data: {
            companyId: company.id,
            name: stage.name,
            color: stage.color,
            orderPosition: stage.orderPosition,
            isDefault: stage.isDefault || false,
            isFinal: stage.isFinal || false,
          },
        })
      }
    }

    return NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, fullName: user.fullName },
      company: company ? { id: company.id, name: company.name } : null,
    })
  } catch (error) {
    return handleApiError(error, '[Setup] Error')
  }
}

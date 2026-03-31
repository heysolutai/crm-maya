import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { z } from 'zod'

const createDepartmentSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  color: z.string().optional(),
  isActive: z.boolean().optional(),
  company_id: z.string().uuid().optional(),
})

const updateDepartmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  color: z.string().optional(),
  isActive: z.boolean().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const departments = await prisma.department.findMany({
      where: { companyId, isActive: true },
      include: {
        members: {
          select: { id: true, userId: true, role: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json(departments)
  } catch (error) {
    console.error('Erro ao buscar departamentos:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const body = await req.json()

    const validation = createDepartmentSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const data = validation.data
    const companyId = data.company_id || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const department = await prisma.department.create({
      data: {
        companyId,
        name: data.name,
        description: data.description || null,
        color: data.color || '#6366f1',
      },
    })
    return NextResponse.json(department, { status: 201 })
  } catch (error) {
    console.error('Erro ao criar departamento:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    const body = await req.json()

    const validation = updateDepartmentSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { id, ...data } = validation.data

    const existing = await prisma.department.findFirst({ where: { id, companyId } })
    if (!existing) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    const department = await prisma.department.update({
      where: { id },
      data,
    })
    return NextResponse.json(department)
  } catch (error) {
    console.error('Erro ao atualizar departamento:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const existing = await prisma.department.findFirst({ where: { id, companyId } })
    if (!existing) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    // Soft delete
    await prisma.department.update({
      where: { id },
      data: { isActive: false },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro ao deletar departamento:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

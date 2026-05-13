import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'

/**
 * IDOR fix: garante que tanto o departamento quanto o usuario pertencem
 * a empresa autenticada antes de qualquer mutacao em DepartmentMember.
 */
async function verifyDepartmentAndUser(
  departmentId: string,
  userId: string,
  companyId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const department = await prisma.department.findFirst({
    where: { id: departmentId, companyId },
    select: { id: true },
  })
  if (!department) return { ok: false, status: 404, error: 'Departamento nao encontrado' }

  const user = await prisma.user.findFirst({
    where: { id: userId, companyId },
    select: { id: true },
  })
  if (!user) return { ok: false, status: 404, error: 'Usuario nao encontrado' }

  return { ok: true }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    const body = await req.json()
    const { departmentId, userId, role = 'member' } = body

    if (!departmentId || !userId) {
      return NextResponse.json({ error: 'Missing departmentId or userId' }, { status: 400 })
    }

    const check = await verifyDepartmentAndUser(departmentId, userId, companyId)
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })

    const member = await prisma.departmentMember.create({
      data: { departmentId, userId, role },
    })
    return NextResponse.json(member)
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'User is already a member of this department' }, { status: 409 })
    }
    return handleApiError(error, 'Erro')}
}

export async function PUT(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    const body = await req.json()
    const { departmentId, userId, role } = body

    if (!departmentId || !userId) {
      return NextResponse.json({ error: 'Missing departmentId or userId' }, { status: 400 })
    }

    const check = await verifyDepartmentAndUser(departmentId, userId, companyId)
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })

    const member = await prisma.departmentMember.updateMany({
      where: { departmentId, userId },
      data: { role },
    })
    return NextResponse.json(member)
  } catch (error) {
    return handleApiError(error, 'Erro')}
}

export async function DELETE(req: NextRequest) {
  try {
    const { companyId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    const departmentId = req.nextUrl.searchParams.get('departmentId')
    const userId = req.nextUrl.searchParams.get('userId')

    if (!departmentId || !userId) {
      return NextResponse.json({ error: 'Missing departmentId or userId' }, { status: 400 })
    }

    const check = await verifyDepartmentAndUser(departmentId, userId, companyId)
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })

    await prisma.departmentMember.deleteMany({
      where: { departmentId, userId },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, 'Erro')}
}

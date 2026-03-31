import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { logAction } from '@/lib/services/audit'
import { z } from 'zod'
import { Prisma } from '@prisma/client'

const createProductSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  sku: z.string().max(100).optional().nullable(),
  price: z.number().nonnegative().optional(),
  cost: z.number().nonnegative().optional(),
  isService: z.boolean().optional(),
  isActive: z.boolean().optional(),
  metadata: z.any().optional().nullable(),
})

const updateProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  sku: z.string().max(100).optional().nullable(),
  price: z.number().nonnegative().optional(),
  cost: z.number().nonnegative().optional(),
  isService: z.boolean().optional(),
  isActive: z.boolean().optional(),
  metadata: z.any().optional().nullable(),
})

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const products = await prisma.product.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
      take: 1000,
    })
    return NextResponse.json(products)
  } catch (error) {
    console.error('Erro ao buscar produtos:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId: authCompanyId, agentId } = await authenticate(req)
    const body = await req.json()
    const companyId = body.company_id || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const validation = createProductSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const productData = {
      ...validation.data,
      companyId,
      metadata: validation.data.metadata ? (validation.data.metadata as Prisma.InputJsonValue) : undefined,
    }
    const product = await prisma.product.create({
      data: productData,
    })

    await logAction({
      companyId,
      userId: agentId,
      action: 'CREATE',
      entity: 'product',
      entityId: product.id,
    })

    return NextResponse.json(product, { status: 201 })
  } catch (error) {
    console.error('Erro ao criar produto:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { companyId, agentId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    const body = await req.json()

    const validation = updateProductSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { id, ...rawData } = validation.data
    const data = {
      ...rawData,
      metadata: rawData.metadata ? (rawData.metadata as Prisma.InputJsonValue) : undefined,
    }

    const existing = await prisma.product.findFirst({ where: { id, companyId } })
    if (!existing) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    const product = await prisma.product.update({ where: { id }, data })

    await logAction({
      companyId,
      userId: agentId,
      action: 'UPDATE',
      entity: 'product',
      entityId: product.id,
    })

    return NextResponse.json(product)
  } catch (error) {
    console.error('Erro ao atualizar produto:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { companyId, agentId } = await authenticate(req)
    if (!companyId) return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 403 })
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const existing = await prisma.product.findFirst({ where: { id, companyId } })
    if (!existing) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

    await prisma.product.delete({ where: { id } })

    await logAction({
      companyId,
      userId: agentId,
      action: 'DELETE',
      entity: 'product',
      entityId: id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro ao deletar produto:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

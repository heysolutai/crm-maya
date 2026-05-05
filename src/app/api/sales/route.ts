import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { logAction } from '@/lib/services/audit'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { handleApiError } from '@/lib/api/errors'

const createSaleSchema = z.object({
  client_id: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  sold_by: z.string().uuid().optional(),
  soldBy: z.string().uuid().optional(),
  sale_number: z.string().optional(),
  saleNumber: z.string().optional(),
  items: z.array(z.any()).min(1),
  subtotal: z.union([z.string(), z.number()]).optional(),
  status: z.string().optional(),
  company_id: z.string().uuid().optional(),
}).refine((data) => data.client_id || data.clientId, {
  message: 'clientId is required',
  path: ['clientId'],
})

export async function POST(req: NextRequest) {
  try {
    const { agentId, companyId: authCompanyId } = await authenticate(req)
    const body = await req.json()

    const validation = createSaleSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const data = validation.data
    const companyId = authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const sale = await prisma.sale.create({
      data: {
        companyId,
        clientId: data.client_id || data.clientId!,
        soldBy: data.sold_by || data.soldBy || agentId,
        saleNumber: data.sale_number || data.saleNumber,
        items: data.items as Prisma.InputJsonValue,
        subtotal: data.subtotal,
        status: data.status || 'approved',
      },
    })

    await logAction({
      companyId,
      userId: agentId,
      action: 'CREATE',
      entity: 'sale',
      entityId: sale.id,
    })

    return NextResponse.json(sale, { status: 201 })
  } catch (error) {
    return handleApiError(error, 'Erro ao criar venda')
  }
}

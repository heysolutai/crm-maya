import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

export async function POST(req: NextRequest) {
  try {
    const { agentId, companyId: authCompanyId } = await authenticate(req)
    const body = await req.json()
    const companyId = body.company_id || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const sale = await prisma.sale.create({
      data: {
        companyId,
        clientId: body.client_id || body.clientId,
        soldBy: body.sold_by || body.soldBy || agentId,
        saleNumber: body.sale_number || body.saleNumber,
        items: body.items,
        subtotal: body.subtotal,
        status: body.status || 'approved',
      },
    })

    return NextResponse.json(sale)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

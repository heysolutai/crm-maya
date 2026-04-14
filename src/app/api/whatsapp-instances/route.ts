import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const activeOnly = req.nextUrl.searchParams.get('activeOnly') === 'true'

    const where: any = { companyId }
    if (activeOnly) where.isActive = true

    const instances = await prisma.whatsappInstance.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    // Mapeia para snake_case (contrato esperado pelo frontend)
    const mapped = instances.map((i) => ({
      id: i.id,
      company_id: i.companyId,
      instance_name: i.instanceName,
      api_url: i.apiUrl,
      instance_api_key: i.instanceApiKey,
      admin_token: i.adminToken,
      status: i.status,
      is_active: i.isActive,
      qr_code: i.qrCode,
      error_message: i.errorMessage,
      last_connected_at: i.lastConnectedAt,
      metadata: i.metadata,
      created_at: i.createdAt,
      updated_at: i.updatedAt,
    }))

    return NextResponse.json(mapped)
  } catch (error) {
    console.error('Error in whatsapp-instances:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

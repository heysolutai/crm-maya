import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

/** GET company settings */
export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, settings: true },
    })
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    return NextResponse.json(company.settings || {})
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * PATCH - Merge-update company settings.
 * Body: { companyId?: string, settings: Record<string, any> }
 * The provided settings are shallow-merged into the existing settings JSON.
 */
export async function PATCH(req: NextRequest) {
  try {
    const { companyId: authCompanyId, isSuperAdmin } = await authenticate(req)
    const body = await req.json()
    const companyId = body.companyId || authCompanyId

    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    // Non-super-admin can only update their own company
    if (!isSuperAdmin && companyId !== authCompanyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get current settings
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { settings: true },
    })
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    const currentSettings = (company.settings as Record<string, any>) || {}
    const newSettings = { ...currentSettings, ...body.settings }

    await prisma.company.update({
      where: { id: companyId },
      data: { settings: newSettings },
    })

    return NextResponse.json({ success: true, settings: newSettings })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  try {
    const { companyId: authCompanyId } = await authenticate(req)
    const userId = req.nextUrl.searchParams.get('userId')
    const companyId = req.nextUrl.searchParams.get('companyId') || authCompanyId

    if (!userId || !companyId) {
      return NextResponse.json({ error: 'Missing userId or companyId' }, { status: 400 })
    }

    // Get user settings
    const userData = await prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true, fullName: true },
    })

    // Get user role for this company
    let roleData = await prisma.userRole.findFirst({
      where: { userId, companyId },
      select: { role: true },
    })

    // Check for super_admin if no company role
    if (!roleData) {
      roleData = await prisma.userRole.findFirst({
        where: { userId, role: 'super_admin' },
        select: { role: true },
      })
    }

    const userRole = roleData?.role

    // Super admin and company_admin have full access
    if (userRole === 'super_admin' || userRole === 'company_admin') {
      const settings = userData?.settings as any
      return NextResponse.json({
        conversation_access: 'all',
        crm_access: 'full',
        appointments_access: 'full',
        sales_access: 'full',
        can_edit_settings: true,
        message_signature: settings?.permissions?.message_signature || userData?.fullName || '',
      })
    }

    // Get role permissions
    const rolePermissions = await prisma.rolePermission.findFirst({
      where: { companyId, role: userRole || 'viewer' },
    })

    const settings = userData?.settings as any

    if (!rolePermissions) {
      return NextResponse.json({
        conversation_access: 'all',
        crm_access: 'full',
        appointments_access: 'full',
        sales_access: 'full',
        can_edit_settings: true,
        message_signature: settings?.permissions?.message_signature || userData?.fullName || '',
      })
    }

    return NextResponse.json({
      conversation_access: rolePermissions.conversationAccess,
      crm_access: rolePermissions.crmAccess,
      appointments_access: rolePermissions.appointmentsAccess,
      sales_access: rolePermissions.salesAccess,
      can_edit_settings: rolePermissions.canEditSettings,
      message_signature: settings?.permissions?.message_signature || userData?.fullName || '',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

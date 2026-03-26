'use client'

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import SuperAdminLayout from '@/layouts/SuperAdminLayout'

export default function SuperAdminRouteLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requireRole="super_admin">
      <SuperAdminLayout>{children}</SuperAdminLayout>
    </ProtectedRoute>
  )
}

'use client'

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import CompanyLayout from '@/layouts/CompanyLayout'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requireCompany>
      <CompanyLayout>{children}</CompanyLayout>
    </ProtectedRoute>
  )
}

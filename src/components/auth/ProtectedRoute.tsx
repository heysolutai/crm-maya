'use client'

import { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useImpersonation } from '@/hooks/useImpersonation';
import { useEffect } from 'react';

type AppRole = 'super_admin' | 'company_admin' | 'manager' | 'agent' | 'viewer';

interface ProtectedRouteProps {
  children: ReactNode;
  requireRole?: AppRole | AppRole[];
  requireCompany?: boolean;
}

export function ProtectedRoute({ children, requireRole, requireCompany }: ProtectedRouteProps) {
  const { user, role, companyId, loading, isSuperAdmin } = useAuth();
  const { isImpersonating, impersonatedCompanyId } = useImpersonation();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!user || !role) {
      router.replace('/auth');
      return;
    }

    // Super admin impersonando pode acessar rotas de empresa
    if (isSuperAdmin && isImpersonating) return;

    // Check if role is required
    if (requireRole) {
      const requiredRoles = Array.isArray(requireRole) ? requireRole : [requireRole];
      if (!requiredRoles.includes(role)) {
        router.replace('/auth');
        return;
      }
    }

    // Check if company is required
    const effectiveCompanyId = isImpersonating ? impersonatedCompanyId : companyId;
    if (requireCompany && !effectiveCompanyId) {
      router.replace('/auth');
      return;
    }
  }, [loading, user, role, companyId, isSuperAdmin, isImpersonating, impersonatedCompanyId, requireRole, requireCompany, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user || !role) return null;

  // Super admin impersonating - allow
  if (isSuperAdmin && isImpersonating) return <>{children}</>;

  // Check role
  if (requireRole) {
    const requiredRoles = Array.isArray(requireRole) ? requireRole : [requireRole];
    if (!requiredRoles.includes(role)) return null;
  }

  // Check company
  const effectiveCompanyId = isImpersonating ? impersonatedCompanyId : companyId;
  if (requireCompany && !effectiveCompanyId) return null;

  return <>{children}</>;
}

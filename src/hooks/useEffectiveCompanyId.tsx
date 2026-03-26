import { useAuth } from './useAuth';
import { useImpersonation } from './useImpersonation';

export function useEffectiveCompanyId() {
  const { companyId } = useAuth();
  const { impersonatedCompanyId, isImpersonating } = useImpersonation();

  // Prioriza o companyId personificado
  const effectiveCompanyId = isImpersonating ? impersonatedCompanyId : companyId;

  return {
    effectiveCompanyId,
    isImpersonating,
    originalCompanyId: companyId,
  };
}

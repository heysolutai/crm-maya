import { useQuery } from '@tanstack/react-query';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';

export interface OnboardingStatus {
  whatsappConnected: boolean;
  whatsappCreated: boolean;
  agentConfigured: boolean;
  knowledgeAdded: boolean;
  apiKeyReady: boolean;
}

export function useOnboarding() {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  return useQuery<OnboardingStatus>({
    queryKey: ['onboarding-status', companyId],
    queryFn: async () => {
      const res = await fetch(`/api/onboarding/status?companyId=${companyId}`);
      if (!res.ok) throw new Error('Falha ao buscar status de onboarding');
      return res.json();
    },
    enabled: !!companyId,
  });
}

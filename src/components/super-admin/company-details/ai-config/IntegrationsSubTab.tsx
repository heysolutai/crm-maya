import { WhatsAppConfigCard } from '@/components/super-admin/company-details/WhatsAppConfigCard';
import { GoogleCalendarConfig } from '@/components/settings/GoogleCalendarConfig';

interface IntegrationsSubTabProps {
  companyId: string;
}

export function IntegrationsSubTab({ companyId }: IntegrationsSubTabProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">🔗 Integrações</h3>
        <p className="text-sm text-muted-foreground">
          Conecte o WhatsApp e o Google Calendar à sua empresa
        </p>
      </div>

      <WhatsAppConfigCard companyId={companyId} />
      <GoogleCalendarConfig />
    </div>
  );
}

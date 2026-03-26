import { useState } from 'react';
import { CreateCompanyDialog } from '@/components/super-admin/CreateCompanyDialog';
import { CompaniesTable } from '@/components/super-admin/CompaniesTable';
import { useCompanies } from '@/hooks/useCompanies';
import { Building2, TrendingUp, Clock, AlertTriangle, Plus } from 'lucide-react';

export default function Companies() {
  const { companies, isLoading } = useCompanies();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCompanies = (companies || []).filter(c => {
    const term = searchTerm.toLowerCase();
    return c.name.toLowerCase().includes(term) ||
      c.trade_name?.toLowerCase().includes(term) ||
      c.email?.toLowerCase().includes(term);
  });

  const totalCompanies = companies?.length || 0;
  const activeCount = companies?.filter(c => c.subscription_status === 'active').length || 0;
  const trialCount = companies?.filter(c => c.subscription_status === 'trial').length || 0;
  const pendingSetupCount = companies?.filter(c => (c.settings as any)?.setup_completed !== true).length || 0;

  const now = new Date();
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(now.getDate() + 7);
  const expiringCount = companies?.filter(c => {
    const expiryDate = c.subscription_status === 'trial' ? c.trial_ends_at : c.subscription_expires_at;
    if (!expiryDate) return false;
    const d = new Date(expiryDate);
    return d >= now && d <= sevenDaysFromNow;
  }).length || 0;

  const statsCards = [
    {
      title: 'TOTAL EMPRESAS',
      value: totalCompanies,
      subtitle: `+${totalCompanies > 0 ? Math.round((activeCount / totalCompanies) * 100) : 0}%`,
      subtitleColor: 'text-emerald-400',
    },
    {
      title: 'PLANOS ATIVOS',
      value: activeCount,
      subtitle: `Saúde ${totalCompanies > 0 ? Math.round((activeCount / totalCompanies) * 100) : 0}%`,
      subtitleColor: 'text-blue-400',
    },
    {
      title: 'EM TRIAL',
      value: trialCount,
      subtitle: pendingSetupCount > 0 ? 'Setup' : 'OK',
      subtitleColor: 'text-amber-400',
    },
    {
      title: 'PRÓX. VENCIMENTOS',
      value: expiringCount.toString().padStart(2, '0'),
      subtitle: '7 dias',
      subtitleColor: 'text-rose-400',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lista de Empresas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie e monitore todas as empresas cadastradas no ecossistema.
          </p>
        </div>
        <CreateCompanyDialog />
      </div>

      {/* Table Card */}
      <div className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          </div>
        ) : (
          <CompaniesTable
            companies={filteredCompanies}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            totalCount={totalCompanies}
          />
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsCards.map((card) => (
          <div
            key={card.title}
            className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm p-5"
          >
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">{card.title}</p>
            <div className="flex items-end gap-3 mt-2">
              <p className="text-3xl font-bold leading-none">{card.value}</p>
              <p className={`text-xs font-medium ${card.subtitleColor} mb-0.5`}>{card.subtitle}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

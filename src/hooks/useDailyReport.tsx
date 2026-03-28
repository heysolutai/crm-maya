import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeFn } from '@/lib/api-functions';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';
import { format } from 'date-fns';

export function useDailyReport(reportDate?: Date) {
  const { effectiveCompanyId } = useEffectiveCompanyId();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const today = reportDate || new Date();
  const dateStr = format(today, 'yyyy-MM-dd');

  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
  const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
  const startOfDay = dayStart.toISOString();
  const endOfDay = dayEnd.toISOString();

  // Fetch all daily report data in one request
  const { data: reportData } = useQuery({
    queryKey: ['daily-report-data', effectiveCompanyId, dateStr],
    queryFn: async () => {
      if (!effectiveCompanyId) return null;

      const params = new URLSearchParams({
        companyId: effectiveCompanyId,
        startOfDay,
        endOfDay,
        dateStr,
      });

      const res = await fetch(`/api/daily-report?${params}`);
      if (!res.ok) throw new Error('Failed to fetch daily report data');
      return await res.json();
    },
    enabled: !!effectiveCompanyId,
  });

  const crmEntriesData = reportData?.crmEntriesData || [];
  const crmScheduledData = reportData?.crmScheduledData || [];
  const crmScheduledTodayData = reportData?.crmScheduledTodayData || [];
  const todayAppointments = reportData?.todayAppointments || [];
  const todaySales = reportData?.todaySales || [];
  const existingReport = reportData?.existingReport || null;
  const reportHistory = reportData?.reportHistory || [];

  const crmEntries = crmEntriesData.filter((c: any) => c.source !== 'comparecimento' && c.source !== 'walk_in').length;
  const crmScheduled = crmScheduledData.filter((a: any) => a.notes !== 'comparecimento' && a.notes !== 'walk-in').length;
  const crmScheduledToday = crmScheduledTodayData.filter((a: any) => a.notes !== 'walk-in' && a.status !== 'completed').length;

  // Register a sale for an appointment
  const registerSale = useMutation({
    mutationFn: async ({ clientId, product, value }: { clientId: string; product: string; value: number }) => {
      if (!effectiveCompanyId || !user?.id) throw new Error('Missing company or user');

      const saleNumber = `V-${format(today, 'yyyyMMdd')}-${Date.now().toString(36).toUpperCase()}`;

      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: effectiveCompanyId,
          client_id: clientId,
          sold_by: user.id,
          sale_number: saleNumber,
          items: [{ name: product, quantity: 1, unit_price: value, total: value }],
          subtotal: value,
          status: 'approved',
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to register sale');
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-report-data'] });
      toast({ title: 'Venda registrada com sucesso!' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao registrar venda', description: error.message, variant: 'destructive' });
    },
  });

  // Generate and send report
  const generateReport = useMutation({
    mutationFn: async () => {
      if (!effectiveCompanyId || !user?.id) throw new Error('Missing company or user');

      const { data, error } = await invokeFn('generate-daily-report', {
        company_id: effectiveCompanyId,
        report_date: dateStr,
        manual_entries: 0,
        manual_scheduled: 0,
        manual_scheduled_today: 0,
        manual_attended: 0,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['daily-report-data'] });
      toast({
        title: 'Relatório gerado!',
        description: data?.sent ? 'Relatório enviado para o grupo do WhatsApp.' : 'Relatório salvo. Configure o grupo WhatsApp para enviar automaticamente.',
      });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao gerar relatório', description: error.message || 'Tente novamente.', variant: 'destructive' });
    },
  });

  const salesTotalAmount = todaySales.reduce((sum: number, s: any) => sum + (Number(s.totalAmount || s.total_amount) || 0), 0);

  return {
    crmEntries,
    crmEntriesData,
    crmScheduled,
    crmScheduledData,
    crmScheduledToday,
    crmScheduledTodayData,
    todayAppointments,
    todaySales,
    salesTotalAmount,
    existingReport,
    reportHistory,
    generateReport,
    registerSale,
    isGenerating: generateReport.isPending,
  };
}

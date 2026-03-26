import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { invokeFn } from '@/lib/supabase-functions-adapter';
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

  // Use local timezone boundaries converted to UTC for correct filtering
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
  const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
  const startOfDay = dayStart.toISOString();
  const endOfDay = dayEnd.toISOString();

  // CRM: clients created today (entrantes) - with full data
  const { data: crmEntriesData = [] } = useQuery({
    queryKey: ['crm-entries-today', effectiveCompanyId, dateStr],
    queryFn: async () => {
      if (!effectiveCompanyId) return [];
      const { data } = await supabase
        .from('clients')
        .select('id, first_name, last_name, full_name, phone, source, created_at')
        .eq('company_id', effectiveCompanyId)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!effectiveCompanyId,
  });
  // Exclude clients created via comparecimento/walk_in (they are not real "entrantes")
  const crmEntries = crmEntriesData.filter((c: any) => c.source !== 'comparecimento' && c.source !== 'walk_in').length;

  // CRM: appointments created today (agendaram hoje) - with full data
  const { data: crmScheduledData = [] } = useQuery({
    queryKey: ['crm-scheduled-today', effectiveCompanyId, dateStr],
    queryFn: async () => {
      if (!effectiveCompanyId) return [];
      const { data } = await supabase
        .from('appointments')
        .select('id, title, scheduled_for, status, patient_name, client_id, notes, clients(id, first_name, last_name, full_name, phone)')
        .eq('company_id', effectiveCompanyId)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!effectiveCompanyId,
  });
  // Exclude manual comparecimento/walk-in appointments (they are not real "agendaram")
  const crmScheduled = crmScheduledData.filter((a: any) => a.notes !== 'comparecimento' && a.notes !== 'walk-in').length;

  // CRM: appointments scheduled for today (agendados p/ hoje)
  const { data: crmScheduledTodayData = [] } = useQuery({
    queryKey: ['crm-scheduled-for-today', effectiveCompanyId, dateStr],
    queryFn: async () => {
      if (!effectiveCompanyId) return [];
      const { data } = await supabase
        .from('appointments')
        .select('id, title, scheduled_for, status, patient_name, client_id, notes, clients(id, first_name, last_name, full_name, phone)')
        .eq('company_id', effectiveCompanyId)
        .gte('scheduled_for', startOfDay)
        .lte('scheduled_for', endOfDay)
        .order('scheduled_for', { ascending: true });
      return data || [];
    },
    enabled: !!effectiveCompanyId,
  });
  // Exclude walk-in and completed appointments from "Agendados pra Hoje" count
  const crmScheduledToday = crmScheduledTodayData.filter((a: any) => a.notes !== 'walk-in' && a.status !== 'completed').length;

  // Today's appointments with client details (for marking sales)
  const { data: todayAppointments = [] } = useQuery({
    queryKey: ['appointments-today-list', effectiveCompanyId, dateStr],
    queryFn: async () => {
      if (!effectiveCompanyId) return [];
      const { data } = await supabase
        .from('appointments')
        .select('id, title, scheduled_for, status, patient_name, client_id, notes, clients(id, first_name, last_name, full_name)')
        .eq('company_id', effectiveCompanyId)
        .gte('scheduled_for', startOfDay)
        .lte('scheduled_for', endOfDay)
        .order('scheduled_for', { ascending: true });
      return data || [];
    },
    enabled: !!effectiveCompanyId,
  });

  // Sales of the day
  const { data: todaySales = [] } = useQuery({
    queryKey: ['sales-today', effectiveCompanyId, dateStr],
    queryFn: async () => {
      if (!effectiveCompanyId) return [];
      const { data } = await supabase
        .from('sales')
        .select('id, total_amount, items, client_id, sale_number, clients(first_name, last_name, full_name)')
        .eq('company_id', effectiveCompanyId)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!effectiveCompanyId,
  });

  // Register a sale for an appointment
  const registerSale = useMutation({
    mutationFn: async ({ clientId, product, value }: { clientId: string; product: string; value: number }) => {
      if (!effectiveCompanyId || !user?.id) throw new Error('Missing company or user');

      // Generate sale number
      const saleNumber = `V-${format(today, 'yyyyMMdd')}-${Date.now().toString(36).toUpperCase()}`;

      const { data, error } = await supabase
        .from('sales')
        .insert({
          company_id: effectiveCompanyId,
          client_id: clientId,
          sold_by: user.id,
          sale_number: saleNumber,
          items: [{ name: product, quantity: 1, unit_price: value, total: value }],
          subtotal: value,
          status: 'approved',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-today'] });
      toast({ title: '✅ Venda registrada com sucesso!' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao registrar venda', description: error.message, variant: 'destructive' });
    },
  });

  // Existing report for today
  const { data: existingReport } = useQuery({
    queryKey: ['daily-report', effectiveCompanyId, dateStr],
    queryFn: async () => {
      if (!effectiveCompanyId) return null;
      const { data } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('company_id', effectiveCompanyId)
        .eq('report_date', dateStr)
        .maybeSingle();
      return data;
    },
    enabled: !!effectiveCompanyId,
  });

  // Report history
  const { data: reportHistory = [] } = useQuery({
    queryKey: ['daily-reports-history', effectiveCompanyId],
    queryFn: async () => {
      if (!effectiveCompanyId) return [];
      const { data } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('company_id', effectiveCompanyId)
        .order('report_date', { ascending: false })
        .limit(30);
      return data || [];
    },
    enabled: !!effectiveCompanyId,
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
      queryClient.invalidateQueries({ queryKey: ['daily-report'] });
      queryClient.invalidateQueries({ queryKey: ['daily-reports-history'] });
      toast({
        title: '✅ Relatório gerado!',
        description: data?.sent ? 'Relatório enviado para o grupo do WhatsApp.' : 'Relatório salvo. Configure o grupo WhatsApp para enviar automaticamente.',
      });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao gerar relatório', description: error.message || 'Tente novamente.', variant: 'destructive' });
    },
  });

  const salesTotalAmount = todaySales.reduce((sum: number, s: any) => sum + (Number(s.total_amount) || 0), 0);

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

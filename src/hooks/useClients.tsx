import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { toast } from '@/hooks/use-toast';

export interface Client {
  id: string;
  company_id: string;
  first_name: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  secondary_phone?: string;
  document_number?: string;
  gender?: string;
  birth_date?: string;
  source?: string;
  tags?: string[];
  address?: any;
  custom_fields?: any;
  assigned_to?: string;
  stage_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  avatar_url?: string;
}

export function useClients() {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  const { data: clients = [], isLoading: loading } = useQuery({
    queryKey: ['clients', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const { data, error } = await supabase
        .from('clients')
        .select(`
          id, company_id, first_name, last_name, full_name, email, phone,
          secondary_phone, document_number, gender, birth_date, source, tags,
          address, assigned_to, stage_id, is_active, created_at, updated_at,
          created_by, avatar_url,
          appointments(id, scheduled_for, status),
          sales(id, total_amount, status)
        `)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) throw error;

      return (data || []).map((client: any) => {
        const appointments = client.appointments || [];
        const sales = client.sales || [];

        const upcomingAppointments = appointments
          .filter((a: any) =>
            a.status === 'scheduled' &&
            new Date(a.scheduled_for) > new Date()
          )
          .sort((a: any, b: any) =>
            new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime()
          );

        const approvedSales = sales.filter((s: any) => s.status === 'approved');

        return {
          ...client,
          next_appointment: upcomingAppointments[0]?.scheduled_for,
          total_appointments: upcomingAppointments.length,
          total_sales: approvedSales.length,
          total_revenue: approvedSales.reduce(
            (sum: number, s: any) => sum + (parseFloat(s.total_amount) || 0),
            0
          ),
        };
      });
    },
    enabled: !!companyId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['clients', companyId] });

  const createClient = async (clientData: Partial<Client>) => {
    if (!companyId) return null;
    if (!clientData.first_name) {
      toast({ title: 'Erro', description: 'Nome é obrigatório', variant: 'destructive' });
      return null;
    }

    try {
      const { full_name, ...insertData } = clientData;
      const { data, error } = await supabase
        .from('clients')
        .insert([{
          ...insertData,
          company_id: companyId,
          first_name: clientData.first_name
        }])
        .select()
        .single();

      if (error) throw error;

      toast({ title: 'Cliente criado', description: 'Cliente adicionado com sucesso!' });
      invalidate();
      return data;
    } catch (error: any) {
      toast({ title: 'Erro ao criar cliente', description: error.message, variant: 'destructive' });
      return null;
    }
  };

  const updateClient = async (id: string, clientData: Partial<Client>) => {
    try {
      const { full_name, ...updateData } = clientData;
      const { error } = await supabase
        .from('clients')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      toast({ title: 'Cliente atualizado', description: 'Alterações salvas com sucesso!' });
      invalidate();
      return true;
    } catch (error: any) {
      toast({ title: 'Erro ao atualizar cliente', description: error.message, variant: 'destructive' });
      return false;
    }
  };

  const deleteClient = async (id: string) => {
    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({ title: 'Cliente removido', description: 'Cliente excluído com sucesso!' });
      invalidate();
      return true;
    } catch (error: any) {
      toast({ title: 'Erro ao remover cliente', description: error.message, variant: 'destructive' });
      return false;
    }
  };

  const moveClientToStage = async (clientId: string, stageId: string) => {
    try {
      const { error } = await supabase
        .from('clients')
        .update({ stage_id: stageId })
        .eq('id', clientId);

      if (error) throw error;

      toast({ title: 'Cliente movido', description: 'Cliente movido com sucesso.' });
      invalidate();
      return true;
    } catch (error: any) {
      toast({ title: 'Erro ao mover cliente', description: error.message, variant: 'destructive' });
      return false;
    }
  };

  return {
    clients,
    loading,
    fetchClients: invalidate,
    createClient,
    updateClient,
    deleteClient,
    moveClientToStage,
  };
}

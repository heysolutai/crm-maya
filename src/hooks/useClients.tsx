import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

  // Cache do total real (header X-Total-Count). O array de clients pode estar
  // limitado pelo limit da query — total reflete o tamanho real na empresa.
  const { data: queryResult, isLoading: loading } = useQuery({
    queryKey: ['clients', companyId],
    queryFn: async () => {
      if (!companyId) return { clients: [], total: 0 };

      const res = await fetch(`/api/clients?companyId=${companyId}`);
      if (!res.ok) throw new Error('Failed to fetch clients');
      const data = await res.json();
      const total = parseInt(res.headers.get('X-Total-Count') || '0', 10);

      const clients = (data || []).map((client: any) => {
        const appointments = client.appointments || [];
        const sales = client.sales || [];

        const upcomingAppointments = appointments
          .filter((a: any) =>
            a.status === 'scheduled' &&
            new Date(a.scheduledFor || a.scheduled_for) > new Date()
          )
          .sort((a: any, b: any) =>
            new Date(a.scheduledFor || a.scheduled_for).getTime() - new Date(b.scheduledFor || b.scheduled_for).getTime()
          );

        const approvedSales = sales.filter((s: any) => s.status === 'approved');

        return {
          ...client,
          // Normalize Prisma camelCase to snake_case for compatibility
          company_id: client.companyId || client.company_id,
          first_name: client.firstName || client.first_name,
          last_name: client.lastName || client.last_name,
          full_name: client.fullName || client.full_name,
          secondary_phone: client.secondaryPhone || client.secondary_phone,
          document_number: client.documentNumber || client.document_number,
          birth_date: client.birthDate || client.birth_date,
          assigned_to: client.assignedTo || client.assigned_to,
          stage_id: client.stageId || client.stage_id,
          is_active: client.isActive ?? client.is_active,
          created_at: client.createdAt || client.created_at,
          updated_at: client.updatedAt || client.updated_at,
          created_by: client.createdBy || client.created_by,
          avatar_url: client.avatarUrl || client.avatar_url,
          next_appointment: upcomingAppointments[0]?.scheduledFor || upcomingAppointments[0]?.scheduled_for,
          total_appointments: upcomingAppointments.length,
          total_sales: approvedSales.length,
          total_revenue: approvedSales.reduce(
            (sum: number, s: any) => sum + (parseFloat(s.totalAmount || s.total_amount) || 0),
            0
          ),
        };
      });

      return { clients, total };
    },
    enabled: !!companyId,
  });

  // Backwards compat: a maioria dos consumers le `clients` direto do hook.
  // Tambem exporta `totalClients` (do header X-Total-Count) que pode ser
  // diferente de clients.length quando a empresa passa de 1000 (limit do API).
  const clients = queryResult?.clients || [];
  const totalClients = queryResult?.total ?? 0;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['clients', companyId] });

  const createClient = async (clientData: Partial<Client>) => {
    if (!companyId) return null;
    if (!clientData.first_name) {
      toast({ title: 'Erro', description: 'Nome é obrigatório', variant: 'destructive' });
      return null;
    }

    try {
      const { full_name, ...insertData } = clientData;
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...insertData,
          company_id: companyId,
          firstName: clientData.first_name,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create client');
      }
      const data = await res.json();

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
      const res = await fetch('/api/clients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updateData }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update client');
      }

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
      const res = await fetch(`/api/clients?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete client');
      }

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
      const res = await fetch('/api/clients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: clientId, stageId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to move client');
      }

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
    totalClients,
    loading,
    fetchClients: invalidate,
    createClient,
    updateClient,
    deleteClient,
    moveClientToStage,
  };
}

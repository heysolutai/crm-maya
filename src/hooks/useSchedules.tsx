import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffectiveCompanyId } from "./useEffectiveCompanyId";
import { toast } from "sonner";

export interface DoctorSchedule {
  id: string;
  companyId: string;
  userId: string;
  name: string;
  color: string;
  businessHours: Record<string, { enabled: boolean; start: string; end: string }>;
  appointmentSettings: Record<string, number>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    fullName: string | null;
    email: string;
    avatarUrl: string | null;
  };
  _count?: { appointments: number };
}

export function useSchedules() {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  const { data: schedules = [], isLoading: loading } = useQuery({
    queryKey: ["schedules", companyId],
    queryFn: async () => {
      const res = await fetch(`/api/schedules?companyId=${companyId}`);
      if (!res.ok) throw new Error("Falha ao buscar agendas");
      const json = await res.json();
      return (json.data || []) as DoctorSchedule[];
    },
    enabled: !!companyId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["schedules", companyId] });

  const createSchedule = useMutation({
    mutationFn: async (data: { userId: string; name: string; color?: string; businessHours?: Record<string, unknown>; appointmentSettings?: Record<string, unknown> }) => {
      const res = await fetch(`/api/schedules?companyId=${companyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao criar agenda");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Agenda criada com sucesso!");
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateSchedule = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; color?: string; isActive?: boolean; businessHours?: Record<string, unknown>; appointmentSettings?: Record<string, unknown> }) => {
      const res = await fetch(`/api/schedules/${id}?companyId=${companyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao atualizar agenda");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Agenda atualizada com sucesso!");
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteSchedule = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/schedules/${id}?companyId=${companyId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao excluir agenda");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Agenda excluida com sucesso!");
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return {
    schedules,
    loading,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    invalidate,
  };
}

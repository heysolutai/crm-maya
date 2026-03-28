import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeFn } from '@/lib/api-functions';
import { useToast } from '@/hooks/use-toast';

export interface FAQ {
  id: string;
  company_id: string;
  question: string;
  answer: string;
  keywords: string[] | null;
  category: string | null;
  order_position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateFAQData {
  question: string;
  answer: string;
  keywords?: string[];
  category?: string;
}

export interface UpdateFAQData {
  question?: string;
  answer?: string;
  keywords?: string[];
  category?: string;
  is_active?: boolean;
  order_position?: number;
}

export function useFAQs(companyId: string | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: faqs, isLoading } = useQuery({
    queryKey: ['company-faqs', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const res = await fetch(`/api/faqs?companyId=${companyId}`);
      if (!res.ok) throw new Error('Failed to fetch FAQs');
      const data = await res.json();
      return (data || []).map((f: any) => ({
        ...f,
        company_id: f.companyId || f.company_id,
        order_position: f.orderPosition ?? f.order_position,
        is_active: f.isActive ?? f.is_active,
        created_at: f.createdAt || f.created_at,
        updated_at: f.updatedAt || f.updated_at,
      })) as FAQ[];
    },
    enabled: !!companyId,
  });

  const createFAQMutation = useMutation({
    mutationFn: async (faqData: CreateFAQData) => {
      if (!companyId) throw new Error('Company ID is required');

      const maxPosition = faqs?.reduce((max, faq) => Math.max(max, faq.order_position), -1) ?? -1;

      const res = await fetch('/api/faqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          question: faqData.question,
          answer: faqData.answer,
          keywords: faqData.keywords || null,
          category: faqData.category || null,
          orderPosition: maxPosition + 1,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create FAQ');
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-faqs', companyId] });
      toast({ title: 'FAQ criada com sucesso' });
    },
    onError: (error) => {
      console.error('Error creating FAQ:', error);
      toast({ title: 'Erro ao criar FAQ', variant: 'destructive' });
    },
  });

  const updateFAQMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: UpdateFAQData }) => {
      const res = await fetch('/api/faqs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update FAQ');
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-faqs', companyId] });
      toast({ title: 'FAQ atualizada com sucesso' });
    },
    onError: (error) => {
      console.error('Error updating FAQ:', error);
      toast({ title: 'Erro ao atualizar FAQ', variant: 'destructive' });
    },
  });

  const deleteFAQMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/faqs?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete FAQ');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-faqs', companyId] });
      toast({ title: 'FAQ excluída com sucesso' });
    },
    onError: (error) => {
      console.error('Error deleting FAQ:', error);
      toast({ title: 'Erro ao excluir FAQ', variant: 'destructive' });
    },
  });

  const deleteManyFAQsMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch('/api/faqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteMany', ids }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete FAQs');
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['company-faqs', companyId] });
      toast({ title: `${variables.length} FAQ(s) excluída(s) com sucesso` });
    },
    onError: (error) => {
      console.error('Error deleting FAQs:', error);
      toast({ title: 'Erro ao excluir FAQs', variant: 'destructive' });
    },
  });

  const toggleFAQMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const res = await fetch('/api/faqs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isActive: is_active }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to toggle FAQ');
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['company-faqs', companyId] });
      toast({ title: variables.is_active ? 'FAQ ativada' : 'FAQ desativada' });
    },
    onError: (error) => {
      console.error('Error toggling FAQ:', error);
      toast({ title: 'Erro ao alterar status da FAQ', variant: 'destructive' });
    },
  });

  const reorderFAQsMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const res = await fetch('/api/faqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reorder', orderedIds }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to reorder FAQs');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-faqs', companyId] });
    },
    onError: (error) => {
      console.error('Error reordering FAQs:', error);
      toast({ title: 'Erro ao reordenar FAQs', variant: 'destructive' });
    },
  });

  const syncToKnowledgeBaseMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error('Company ID is required');
      const { data, error } = await invokeFn('sync-knowledge-base', { company_id: companyId });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ai-configurations', companyId] });
      toast({ title: 'Knowledge Base sincronizada', description: `Nome: ${data.knowledge_name}` });
    },
    onError: (error) => {
      console.error('Error syncing to Knowledge Base:', error);
      toast({ title: 'Erro ao sincronizar Knowledge Base', description: (error as any).message, variant: 'destructive' });
    },
  });

  return {
    faqs: faqs || [],
    isLoading,
    createFAQ: createFAQMutation.mutate,
    updateFAQ: updateFAQMutation.mutate,
    deleteFAQ: deleteFAQMutation.mutate,
    deleteManyFAQs: deleteManyFAQsMutation.mutate,
    toggleFAQ: toggleFAQMutation.mutate,
    reorderFAQs: reorderFAQsMutation.mutate,
    syncToKnowledgeBase: syncToKnowledgeBaseMutation.mutate,
    isCreating: createFAQMutation.isPending,
    isUpdating: updateFAQMutation.isPending,
    isDeleting: deleteFAQMutation.isPending,
    isDeletingMany: deleteManyFAQsMutation.isPending,
    isSyncing: syncToKnowledgeBaseMutation.isPending,
  };
}

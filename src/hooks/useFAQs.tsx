import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { invokeFn } from '@/lib/supabase-functions-adapter';
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

  // Fetch FAQs
  const { data: faqs, isLoading } = useQuery({
    queryKey: ['company-faqs', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const { data, error } = await supabase
        .from('company_faqs')
        .select('*')
        .eq('company_id', companyId)
        .order('order_position', { ascending: true });

      if (error) throw error;
      return data as FAQ[];
    },
    enabled: !!companyId,
  });

  // Create FAQ
  const createFAQMutation = useMutation({
    mutationFn: async (faqData: CreateFAQData) => {
      if (!companyId) throw new Error('Company ID is required');

      // Get next order position
      const maxPosition = faqs?.reduce((max, faq) => Math.max(max, faq.order_position), -1) ?? -1;

      const { data, error } = await supabase
        .from('company_faqs')
        .insert({
          company_id: companyId,
          question: faqData.question,
          answer: faqData.answer,
          keywords: faqData.keywords || null,
          category: faqData.category || null,
          order_position: maxPosition + 1,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
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

  // Update FAQ
  const updateFAQMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: UpdateFAQData }) => {
      const { data, error } = await supabase
        .from('company_faqs')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
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

  // Delete FAQ
  const deleteFAQMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('company_faqs')
        .delete()
        .eq('id', id);

      if (error) throw error;
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

  // Delete multiple FAQs
  const deleteManyFAQsMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('company_faqs')
        .delete()
        .in('id', ids);

      if (error) throw error;
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

  // Toggle FAQ active status
  const toggleFAQMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('company_faqs')
        .update({ is_active })
        .eq('id', id);

      if (error) throw error;
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

  // Reorder FAQs
  const reorderFAQsMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      // Update each FAQ with its new position
      const updates = orderedIds.map((id, index) => 
        supabase
          .from('company_faqs')
          .update({ order_position: index })
          .eq('id', id)
      );

      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-faqs', companyId] });
    },
    onError: (error) => {
      console.error('Error reordering FAQs:', error);
      toast({ title: 'Erro ao reordenar FAQs', variant: 'destructive' });
    },
  });

  // Sync to Knowledge Base
  const syncToKnowledgeBaseMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error('Company ID is required');

      const { data, error } = await invokeFn('sync-knowledge-base', { company_id: companyId });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ai-configurations', companyId] });
      toast({ 
        title: 'Knowledge Base sincronizada', 
        description: `Nome: ${data.knowledge_name}`,
      });
    },
    onError: (error) => {
      console.error('Error syncing to Knowledge Base:', error);
      toast({ 
        title: 'Erro ao sincronizar Knowledge Base', 
        description: error.message,
        variant: 'destructive',
      });
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

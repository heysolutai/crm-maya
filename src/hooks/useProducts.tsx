import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useEffectiveCompanyId } from './useEffectiveCompanyId';
import { toast } from '@/hooks/use-toast';

export interface Product {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  sku?: string;
  price: number;
  cost?: number;
  category?: string;
  is_service: boolean;
  is_active: boolean;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

export function useProducts() {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  const { data: products = [], isLoading: loading } = useQuery({
    queryKey: ['products', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const { data, error } = await supabase
        .from('products')
        .select('id, company_id, name, description, sku, price, cost, category, is_service, is_active, created_at, updated_at')
        .eq('company_id', companyId)
        .order('name', { ascending: true })
        .limit(1000);

      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['products', companyId] });

  const createProduct = async (productData: Partial<Product>) => {
    if (!companyId) return null;
    if (!productData.name || productData.price === undefined) {
      toast({ title: 'Erro', description: 'Nome e preço são obrigatórios', variant: 'destructive' });
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('products')
        .insert([{
          ...productData,
          company_id: companyId,
          name: productData.name,
          price: productData.price
        }])
        .select()
        .single();

      if (error) throw error;

      toast({ title: 'Produto criado', description: 'Produto adicionado com sucesso!' });
      invalidate();
      return data;
    } catch (error: any) {
      toast({ title: 'Erro ao criar produto', description: error.message, variant: 'destructive' });
      return null;
    }
  };

  const updateProduct = async (id: string, productData: Partial<Product>) => {
    try {
      const { error } = await supabase
        .from('products')
        .update(productData)
        .eq('id', id);

      if (error) throw error;

      toast({ title: 'Produto atualizado', description: 'Alterações salvas com sucesso!' });
      invalidate();
      return true;
    } catch (error: any) {
      toast({ title: 'Erro ao atualizar produto', description: error.message, variant: 'destructive' });
      return false;
    }
  };

  const deleteProduct = async (id: string) => {
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({ title: 'Produto removido', description: 'Produto excluído com sucesso!' });
      invalidate();
      return true;
    } catch (error: any) {
      toast({ title: 'Erro ao remover produto', description: error.message, variant: 'destructive' });
      return false;
    }
  };

  return {
    products,
    loading,
    fetchProducts: invalidate,
    createProduct,
    updateProduct,
    deleteProduct,
  };
}

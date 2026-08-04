import { apiFetch } from '@/lib/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

      const res = await apiFetch(`/api/products?companyId=${companyId}`);
      if (!res.ok) throw new Error('Failed to fetch products');
      const data = await res.json();
      return (data || []).map((p: any) => ({
        ...p,
        company_id: p.companyId || p.company_id,
        is_service: p.isService ?? p.is_service,
        is_active: p.isActive ?? p.is_active,
        created_at: p.createdAt || p.created_at,
        updated_at: p.updatedAt || p.updated_at,
      }));
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
      const res = await apiFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...productData, company_id: companyId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create product');
      }
      const data = await res.json();

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
      const res = await apiFetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...productData }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update product');
      }

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
      const res = await apiFetch(`/api/products?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete product');
      }

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

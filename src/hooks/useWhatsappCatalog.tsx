import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffectiveCompanyId } from "./useEffectiveCompanyId";
import { toast } from "sonner";

export interface CatalogProduct {
  id: string;
  waProductId: string;
  name: string;
  description?: string;
  price?: string;
  priceAmount?: string;
  currency?: string;
  availability?: string;
  isHidden: boolean;
  retailerId?: string;
  url?: string;
  images: Array<{ id: string; originalUrl: string; thumbUrl: string }>;
  syncedAt: string;
  // Raw fields from UazAPI (fallback)
  [key: string]: unknown;
}

async function callCatalogApi(action: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`/api/whatsapp/catalog?action=${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro na operação do catálogo");
  }
  return res.json();
}

export function useWhatsappCatalog(search = "") {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  // Lê produtos do banco local
  const { data: products = [], isLoading, error, refetch } = useQuery<CatalogProduct[]>({
    queryKey: ["whatsapp-catalog", companyId, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/catalog?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao buscar catálogo");
      }
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: !!companyId,
    retry: false,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["whatsapp-catalog", companyId] });

  // Importa produtos do WhatsApp para o banco
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/catalog/sync", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao importar catálogo");
      }
      return res.json();
    },
    onSuccess: (data: { synced: number; total: number; message?: string }) => {
      if (data.message) {
        toast.info(data.message);
      } else {
        toast.success(`${data.synced} produto(s) importado(s) com sucesso`);
      }
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const getProductInfo = useMutation({
    mutationFn: async (productId: string) => {
      const json = await callCatalogApi("info", { productId });
      return json.data;
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const showProduct = useMutation({
    mutationFn: async (productId: string) => {
      return callCatalogApi("show", { productId });
    },
    onSuccess: async (_data, productId) => {
      toast.success("Produto exibido no catálogo");
      // Atualiza isHidden no banco local
      await fetch(`/api/catalog/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isHidden: false }),
      });
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const hideProduct = useMutation({
    mutationFn: async (productId: string) => {
      return callCatalogApi("hide", { productId });
    },
    onSuccess: async (_data, productId) => {
      toast.success("Produto ocultado do catálogo");
      // Atualiza isHidden no banco local
      await fetch(`/api/catalog/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isHidden: true }),
      });
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteProduct = useMutation({
    mutationFn: async (productId: string) => {
      await callCatalogApi("delete", { productId });
      // Remove do banco local também
      await fetch(`/api/catalog/${productId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      toast.success("Produto deletado do catálogo");
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return {
    products,
    isLoading,
    error,
    refetch,
    syncFromWhatsApp: syncMutation.mutate,
    isSyncing: syncMutation.isPending,
    getProductInfo: getProductInfo.mutateAsync,
    showProduct: showProduct.mutate,
    hideProduct: hideProduct.mutate,
    deleteProduct: deleteProduct.mutate,
    isMutating:
      showProduct.isPending ||
      hideProduct.isPending ||
      deleteProduct.isPending,
  };
}

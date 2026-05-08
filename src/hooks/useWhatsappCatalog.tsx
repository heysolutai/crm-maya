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

function makeCatalogApiFn(companyId: string | null | undefined) {
  return async function callCatalogApi(action: string, body: Record<string, unknown> = {}) {
    const qs = companyId ? `&companyId=${companyId}` : "";
    const res = await fetch(`/api/whatsapp/catalog?action=${action}${qs}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Erro na operação do catálogo");
    }
    return res.json();
  };
}

export function useWhatsappCatalog(search = "") {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const queryClient = useQueryClient();
  const callCatalogApi = makeCatalogApiFn(companyId);

  // Lê produtos do banco local
  const { data: products = [], isLoading, error, refetch } = useQuery<CatalogProduct[]>({
    queryKey: ["whatsapp-catalog", companyId, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (companyId) params.set("companyId", companyId);
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
      const url = companyId ? `/api/catalog/sync?companyId=${companyId}` : "/api/catalog/sync";
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao importar catálogo");
      }
      return res.json();
    },
    onSuccess: (data: { synced: number; deleted?: number; total: number; message?: string }) => {
      if (data.message) {
        toast.info(data.message);
      } else {
        const parts = [`${data.synced} sincronizado(s)`];
        if (typeof data.deleted === 'number' && data.deleted > 0) {
          parts.push(`${data.deleted} removido(s)`);
        }
        toast.success(parts.join(' · '));
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
      const qs = companyId ? `?companyId=${companyId}` : "";
      await fetch(`/api/catalog/${productId}${qs}`, {
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
      const qs = companyId ? `?companyId=${companyId}` : "";
      await fetch(`/api/catalog/${productId}${qs}`, {
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
      const qs = companyId ? `?companyId=${companyId}` : "";
      await fetch(`/api/catalog/${productId}${qs}`, { method: "DELETE" });
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

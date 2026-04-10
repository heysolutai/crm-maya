import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffectiveCompanyId } from "./useEffectiveCompanyId";
import { toast } from "sonner";

export interface CatalogProduct {
  id: string;
  name: string;
  description?: string;
  price?: string;
  currency?: string;
  imageUrl?: string;
  availability?: string;
  isHidden?: boolean;
  retailerId?: string;
  url?: string;
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

function normalizeProduct(raw: Record<string, unknown>): CatalogProduct {
  // UazAPI retorna nomes variados, tentamos mapear
  return {
    id: (raw.id as string) || (raw.productId as string) || (raw.product_id as string) || "",
    name: (raw.name as string) || (raw.title as string) || "",
    description: (raw.description as string) || undefined,
    price: (raw.price as string) || (raw.priceString as string) || undefined,
    currency: (raw.currency as string) || undefined,
    imageUrl: (raw.imageUrl as string) || (raw.image_url as string) || (raw.image as string) || undefined,
    availability: (raw.availability as string) || undefined,
    isHidden: (raw.isHidden as boolean) || (raw.is_hidden as boolean) || false,
    retailerId: (raw.retailerId as string) || (raw.retailer_id as string) || undefined,
    url: (raw.url as string) || undefined,
    ...raw,
  };
}

function extractProducts(data: unknown): CatalogProduct[] {
  if (!data) return [];
  // A API da UazAPI pode retornar em formatos variados
  if (Array.isArray(data)) return data.map(normalizeProduct);
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.products)) return (obj.products as Record<string, unknown>[]).map(normalizeProduct);
  if (Array.isArray(obj.catalog)) return (obj.catalog as Record<string, unknown>[]).map(normalizeProduct);
  if (Array.isArray(obj.items)) return (obj.items as Record<string, unknown>[]).map(normalizeProduct);
  if (Array.isArray(obj.data)) return (obj.data as Record<string, unknown>[]).map(normalizeProduct);
  return [];
}

export function useWhatsappCatalog() {
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  const { data: products = [], isLoading, error, refetch } = useQuery({
    queryKey: ["whatsapp-catalog", companyId],
    queryFn: async () => {
      const json = await callCatalogApi("list");
      return extractProducts(json.data);
    },
    enabled: !!companyId,
    retry: false,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["whatsapp-catalog", companyId] });

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
    onSuccess: () => {
      toast.success("Produto exibido no catálogo");
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
    onSuccess: () => {
      toast.success("Produto ocultado do catálogo");
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteProduct = useMutation({
    mutationFn: async (productId: string) => {
      return callCatalogApi("delete", { productId });
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
    getProductInfo: getProductInfo.mutateAsync,
    showProduct: showProduct.mutate,
    hideProduct: hideProduct.mutate,
    deleteProduct: deleteProduct.mutate,
    isMutating: showProduct.isPending || hideProduct.isPending || deleteProduct.isPending,
  };
}

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
  images: string[];
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
  // UazAPI retorna PascalCase: ID, Name, Price.Amount, Images[0].OriginalImageUrl
  const price = raw.Price as Record<string, string> | undefined;
  const images = raw.Images as Array<Record<string, unknown>> | undefined;

  // Formatar preço: Amount vem em centavos * 1000 (ex: 19900000 = R$199,00)
  let formattedPrice: string | undefined;
  if (price?.Amount) {
    const amount = parseFloat(price.Amount) / 1000;
    formattedPrice = amount.toLocaleString("pt-BR", { style: "currency", currency: price.Currency || "BRL" });
  }

  const imageUrl =
    (images?.[0]?.OriginalImageUrl as string) ||
    (images?.[0]?.RequestImageUrl as string) ||
    (raw.imageUrl as string) ||
    (raw.image_url as string) ||
    undefined;

  return {
    // PascalCase (UazAPI real)
    id: (raw.ID as string) || (raw.id as string) || (raw.productId as string) || "",
    name: (raw.Name as string) || (raw.name as string) || (raw.title as string) || "",
    description: (raw.Description as string) || (raw.description as string) || undefined,
    price: formattedPrice || (raw.price as string) || (raw.priceString as string) || undefined,
    currency: price?.Currency || (raw.currency as string) || undefined,
    imageUrl,
    availability: (raw.Availability as string) || (raw.availability as string) || undefined,
    isHidden: (raw.IsHidden as boolean) ?? (raw.isHidden as boolean) ?? false,
    retailerId: (raw.RetailerID as string) || (raw.retailerId as string) || undefined,
    url: (raw.Url as string) || (raw.url as string) || undefined,
    ...raw,
  };
}

function extractProducts(data: unknown): CatalogProduct[] {
  if (!data) return [];

  const obj = data as Record<string, unknown>;

  // Formato real da UazAPI: { response: { Products: [...] } }
  if (obj.response) {
    const resp = obj.response as Record<string, unknown>;
    if (Array.isArray(resp.Products)) {
      return (resp.Products as Record<string, unknown>[]).map(normalizeProduct);
    }
  }

  // Outros formatos possíveis
  if (Array.isArray(data)) return (data as Record<string, unknown>[]).map(normalizeProduct);
  if (Array.isArray(obj.Products)) return (obj.Products as Record<string, unknown>[]).map(normalizeProduct);
  if (Array.isArray(obj.products)) return (obj.products as Record<string, unknown>[]).map(normalizeProduct);
  if (Array.isArray(obj.catalog)) return (obj.catalog as Record<string, unknown>[]).map(normalizeProduct);
  if (Array.isArray(obj.items)) return (obj.items as Record<string, unknown>[]).map(normalizeProduct);
  if (Array.isArray(obj.data)) return (obj.data as Record<string, unknown>[]).map(normalizeProduct);
  if (Array.isArray(obj.result)) return (obj.result as Record<string, unknown>[]).map(normalizeProduct);

  // Objeto único com ID
  if (obj.ID || obj.id) return [normalizeProduct(obj)];

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

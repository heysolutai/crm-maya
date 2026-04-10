"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { useWhatsappCatalog, CatalogProduct } from "@/hooks/useWhatsappCatalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Search,
  Eye,
  EyeOff,
  Trash2,
  Package,
  RefreshCw,
  Loader2,
  ShoppingBag,
  Info,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function Catalog() {
  const {
    products,
    isLoading,
    error,
    refetch,
    getProductInfo,
    showProduct,
    hideProduct,
    deleteProduct,
    isMutating,
  } = useWhatsappCatalog();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [productInfo, setProductInfo] = useState<Record<string, unknown> | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products;
    const q = searchTerm.toLowerCase();
    return products.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
    );
  }, [products, searchTerm]);

  const visibleCount = products.filter((p) => !p.isHidden).length;
  const hiddenCount = products.filter((p) => p.isHidden).length;

  const handleViewInfo = async (product: CatalogProduct) => {
    setSelectedProduct(product);
    setInfoDialogOpen(true);
    setLoadingInfo(true);
    setProductInfo(null);
    try {
      const info = await getProductInfo(product.id);
      setProductInfo(info as Record<string, unknown>);
    } catch {
      // toast já é mostrado pelo hook
    } finally {
      setLoadingInfo(false);
    }
  };

  const handleDelete = () => {
    if (deleteConfirm) {
      deleteProduct(deleteConfirm);
      setDeleteConfirm(null);
    }
  };

  // Error state — WhatsApp não conectado
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Catálogo</h1>
          <p className="text-muted-foreground">
            Produtos sincronizados do catálogo do WhatsApp Business
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center py-12">
              <AlertCircle className="h-12 w-12 text-destructive mb-4" />
              <h3 className="text-lg font-semibold">Não foi possível carregar o catálogo</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                {error instanceof Error ? error.message : "Erro desconhecido"}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Verifique se o WhatsApp Business está conectado nas configurações.
              </p>
              <Button variant="outline" className="mt-4" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Tentar novamente
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Catálogo</h1>
          <p className="text-muted-foreground">
            Produtos do catálogo do WhatsApp Business
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{products.length}</p>
              </div>
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Visíveis</p>
                <p className="text-2xl font-bold text-green-600">{visibleCount}</p>
              </div>
              <Eye className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Ocultos</p>
                <p className="text-2xl font-bold text-muted-foreground">{hiddenCount}</p>
              </div>
              <EyeOff className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar produto..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && products.length === 0 && (
        <EmptyState
          icon={ShoppingBag}
          title="Catálogo vazio"
          description="Nenhum produto encontrado no catálogo do WhatsApp Business. Adicione produtos no aplicativo oficial do WhatsApp Business."
        />
      )}

      {/* Products grid */}
      {!isLoading && filteredProducts.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredProducts.map((product) => (
            <Card key={product.id} className="overflow-hidden">
              {/* Image */}
              <div className="aspect-square bg-muted relative">
                {product.imageUrl ? (
                  <Image
                    src={product.imageUrl}
                    alt={product.name}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <Package className="h-12 w-12 text-muted-foreground/40" />
                  </div>
                )}
                {product.isHidden && (
                  <Badge variant="secondary" className="absolute top-2 right-2">
                    <EyeOff className="h-3 w-3 mr-1" />
                    Oculto
                  </Badge>
                )}
              </div>

              <CardContent className="p-4 space-y-3">
                <div>
                  <h3 className="font-semibold truncate" title={product.name}>
                    {product.name || "Sem nome"}
                  </h3>
                  {product.price && (
                    <p className="text-lg font-bold text-primary">
                      {product.currency} {product.price}
                    </p>
                  )}
                </div>

                {product.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {product.description}
                  </p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1 pt-2 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleViewInfo(product)}
                    title="Ver informações"
                  >
                    <Info className="h-4 w-4" />
                  </Button>
                  {product.isHidden ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1"
                      onClick={() => showProduct(product.id)}
                      disabled={isMutating}
                      title="Mostrar"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1"
                      onClick={() => hideProduct(product.id)}
                      disabled={isMutating}
                      title="Ocultar"
                    >
                      <EyeOff className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 text-destructive hover:text-destructive"
                    onClick={() => setDeleteConfirm(product.id)}
                    disabled={isMutating}
                    title="Deletar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Info dialog */}
      <Dialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedProduct?.name || "Informações do Produto"}</DialogTitle>
            <DialogDescription>
              Detalhes completos do produto do catálogo
            </DialogDescription>
          </DialogHeader>

          {loadingInfo ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : productInfo ? (
            <div className="space-y-4">
              {selectedProduct?.imageUrl && (
                <div className="aspect-video relative bg-muted rounded-lg overflow-hidden">
                  <Image
                    src={selectedProduct.imageUrl}
                    alt={selectedProduct.name}
                    fill
                    unoptimized
                    className="object-contain"
                  />
                </div>
              )}

              <div className="space-y-2">
                {Object.entries(productInfo).map(([key, value]) => {
                  if (value === null || value === undefined || value === "") return null;
                  return (
                    <div key={key} className="grid grid-cols-3 gap-2 text-sm border-b pb-2">
                      <span className="font-medium text-muted-foreground capitalize">{key}</span>
                      <span className="col-span-2 break-words">
                        {typeof value === "object" ? JSON.stringify(value) : String(value)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {selectedProduct?.url && (
                <Button variant="outline" className="w-full" asChild>
                  <a href={selectedProduct.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Ver produto
                  </a>
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma informação disponível
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setInfoDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="Deletar produto"
        description="Tem certeza que deseja deletar este produto do catálogo do WhatsApp? Esta ação não pode ser desfeita."
        confirmLabel="Deletar"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}

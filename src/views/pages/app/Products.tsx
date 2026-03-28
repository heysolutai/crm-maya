import { useState, useMemo } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Package,
  PackageCheck,
  PackageX,
  TrendingUp,
  Wrench,
  ShoppingBag,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { StatCards, type StatItem } from '@/components/ui/stat-cards';
import { TableSkeleton, CardListSkeleton } from '@/components/ui/table-skeleton';
import { EmptyState } from '@/components/ui/empty-state';

const PAGE_SIZE = 25;

export default function Products() {
  const { products, loading, createProduct, updateProduct, deleteProduct } = useProducts();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<'all' | 'product' | 'service'>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    sku: '',
    price: 0,
    cost: 0,
    category: '',
    is_service: false,
    is_active: true,
  });

  const stats = useMemo((): StatItem[] => {
    const active = products.filter(p => p.is_active).length;
    const services = products.filter(p => p.is_service).length;
    const avgMargin = products.length > 0
      ? products.reduce((sum, p) => {
          if (!p.cost || !p.price) return sum;
          return sum + ((p.price - p.cost) / p.price) * 100;
        }, 0) / products.filter(p => p.cost && p.price).length || 0
      : 0;

    return [
      { label: 'Total Cadastrados', value: products.length, icon: Package, color: 'blue' },
      { label: 'Ativos', value: active, icon: PackageCheck, color: 'green' },
      { label: 'Serviços', value: services, icon: Wrench, color: 'purple', subtitle: `${products.length - services} produtos` },
      { label: 'Margem Média', value: `${avgMargin.toFixed(1)}%`, icon: TrendingUp, color: 'cyan' },
    ];
  }, [products]);

  const filteredProducts = products.filter(product => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      product.name?.toLowerCase().includes(searchLower) ||
      product.sku?.toLowerCase().includes(searchLower) ||
      product.category?.toLowerCase().includes(searchLower);
    const matchesType =
      typeFilter === 'all' ||
      (typeFilter === 'service' && product.is_service) ||
      (typeFilter === 'product' && !product.is_service);
    return matchesSearch && matchesType;
  });

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedProducts = filteredProducts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProduct) {
      await updateProduct(editingProduct.id, formData);
    } else {
      await createProduct(formData);
    }
    setIsDialogOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setFormData({ name: '', description: '', sku: '', price: 0, cost: 0, category: '', is_service: false, is_active: true });
    setEditingProduct(null);
  };

  const handleEdit = (product: any) => {
    setEditingProduct(product);
    setFormData({
      name: product.name || '',
      description: product.description || '',
      sku: product.sku || '',
      price: product.price || 0,
      cost: product.cost || 0,
      category: product.category || '',
      is_service: product.is_service || false,
      is_active: product.is_active ?? true,
    });
    setIsDialogOpen(true);
  };

  const handleDeleteClick = (id: string) => setDeleteConfirm({ open: true, id });

  const handleDeleteConfirm = async () => {
    if (deleteConfirm.id) {
      await deleteProduct(deleteConfirm.id);
      setDeleteConfirm({ open: false, id: null });
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const calculateMargin = (price: number, cost: number) => {
    if (!cost || !price) return '-';
    const margin = ((price - cost) / price) * 100;
    return `${margin.toFixed(1)}%`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Produtos & Serviços</h1>
          <p className="text-muted-foreground">Gerencie seu catálogo de produtos e serviços</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Produto
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[525px]">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>{editingProduct ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
                <DialogDescription>Preencha os dados do produto ou serviço</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input id="name" placeholder="Nome do produto" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Input id="description" placeholder="Breve descrição" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="sku">SKU</Label>
                    <Input id="sku" placeholder="PRD-001" value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="category">Categoria</Label>
                    <Input id="category" placeholder="Ex: Acessórios" value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="price">Preço *</Label>
                    <Input id="price" type="number" step="0.01" value={formData.price} onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })} required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="cost">Custo</Label>
                    <Input id="cost" type="number" step="0.01" value={formData.cost} onChange={(e) => setFormData({ ...formData, cost: parseFloat(e.target.value) })} />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label htmlFor="is_service" className="font-medium">É um serviço?</Label>
                    <p className="text-xs text-muted-foreground">Marque se for prestação de serviço</p>
                  </div>
                  <Switch id="is_service" checked={formData.is_service} onCheckedChange={(checked) => setFormData({ ...formData, is_service: checked })} />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label htmlFor="is_active" className="font-medium">Ativo?</Label>
                    <p className="text-xs text-muted-foreground">Disponível para venda</p>
                  </div>
                  <Switch id="is_active" checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">{editingProduct ? 'Salvar' : 'Criar'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stat Cards */}
      <StatCards items={stats} loading={loading} />

      {/* Search + Filter */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, SKU ou categoria..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          {([
            { key: 'all', label: 'Todos' },
            { key: 'product', label: 'Produtos' },
            { key: 'service', label: 'Serviços' },
          ] as const).map(({ key, label }) => (
            <Button
              key={key}
              variant={typeFilter === key ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setTypeFilter(key); setCurrentPage(1); }}
              className="text-xs"
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        {loading ? (
          <TableSkeleton columns={9} rows={8} headers={['Nome', 'SKU', 'Categoria', 'Tipo', 'Preço', 'Custo', 'Margem', 'Status', 'Ações']} />
        ) : paginatedProducts.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title={searchTerm || typeFilter !== 'all' ? 'Nenhum resultado encontrado' : 'Nenhum produto cadastrado'}
            description={searchTerm || typeFilter !== 'all' ? 'Tente ajustar os filtros ou o termo de busca.' : 'Comece cadastrando seu primeiro produto ou serviço.'}
            actionLabel={!searchTerm && typeFilter === 'all' ? 'Adicionar Produto' : undefined}
            onAction={!searchTerm && typeFilter === 'all' ? () => setIsDialogOpen(true) : undefined}
          />
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  <TableHead className="text-right">Margem</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedProducts.map((product) => {
                  const margin = product.cost ? ((product.price - product.cost) / product.price) * 100 : null;
                  return (
                    <TableRow key={product.id} className="group">
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className={`rounded-md p-1.5 ${product.is_service ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'}`}>
                            {product.is_service ? <Wrench className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
                          </div>
                          <span className="font-medium">{product.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">{product.sku || '-'}</TableCell>
                      <TableCell>
                        {product.category ? (
                          <Badge variant="outline" className="text-xs font-normal">{product.category}</Badge>
                        ) : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {product.is_service ? 'Serviço' : 'Produto'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(product.price)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{product.cost ? formatCurrency(product.cost) : '-'}</TableCell>
                      <TableCell className="text-right">
                        {margin !== null ? (
                          <span className={margin >= 30 ? 'text-emerald-600 dark:text-emerald-400 font-medium' : margin >= 15 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}>
                            {margin.toFixed(1)}%
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${product.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                          <span className="text-xs">{product.is_active ? 'Ativo' : 'Inativo'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(product)} aria-label="Editar produto">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteClick(product.id)} aria-label="Excluir produto">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden">
        {loading ? (
          <CardListSkeleton count={5} />
        ) : paginatedProducts.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title={searchTerm ? 'Nenhum resultado' : 'Nenhum produto'}
            description={searchTerm ? 'Ajuste sua busca.' : 'Adicione seu primeiro produto.'}
            actionLabel={!searchTerm ? 'Adicionar' : undefined}
            onAction={!searchTerm ? () => setIsDialogOpen(true) : undefined}
          />
        ) : (
          <div className="space-y-3">
            {paginatedProducts.map((product) => (
              <Card key={product.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-lg p-2 shrink-0 ${product.is_service ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'}`}>
                      {product.is_service ? <Wrench className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{product.name}</p>
                      <p className="text-sm font-semibold text-primary">{formatCurrency(product.price)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`h-2 w-2 rounded-full ${product.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                    <div className="flex gap-2">
                      {product.category && <Badge variant="outline" className="text-[10px]">{product.category}</Badge>}
                      <Badge variant="secondary" className="text-[10px]">{product.is_service ? 'Serviço' : 'Produto'}</Badge>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(product)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteClick(product.id)} aria-label="Excluir">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-muted-foreground">
            {filteredProducts.length} produto(s) — Página {safePage} de {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={safePage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={safePage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ open, id: open ? deleteConfirm.id : null })}
        title="Excluir Produto"
        description="Tem certeza que deseja excluir este produto? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}

import { useState } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { Plus, Search, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

const PAGE_SIZE = 25;

export default function Products() {
  const { products, loading, createProduct, updateProduct, deleteProduct } = useProducts();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
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

  const filteredProducts = products.filter(product => {
    const searchLower = searchTerm.toLowerCase();
    return (
      product.name?.toLowerCase().includes(searchLower) ||
      product.sku?.toLowerCase().includes(searchLower) ||
      product.category?.toLowerCase().includes(searchLower)
    );
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
    setFormData({
      name: '',
      description: '',
      sku: '',
      price: 0,
      cost: 0,
      category: '',
      is_service: false,
      is_active: true,
    });
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

  const handleDeleteClick = (id: string) => {
    setDeleteConfirm({ open: true, id });
  };

  const handleDeleteConfirm = async () => {
    if (deleteConfirm.id) {
      await deleteProduct(deleteConfirm.id);
      setDeleteConfirm({ open: false, id: null });
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const calculateMargin = (price: number, cost: number) => {
    if (!cost) return '-';
    const margin = ((price - cost) / price) * 100;
    return `${margin.toFixed(1)}%`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Produtos & Serviços</h1>
          <p className="text-muted-foreground">
            Gerencie seu catálogo de produtos e serviços
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Produto
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[525px]">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>
                  {editingProduct ? 'Editar Produto' : 'Novo Produto'}
                </DialogTitle>
                <DialogDescription>
                  Preencha os dados do produto ou serviço
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="sku">SKU</Label>
                    <Input
                      id="sku"
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="category">Categoria</Label>
                    <Input
                      id="category"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="price">Preço *</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="cost">Custo</Label>
                    <Input
                      id="cost"
                      type="number"
                      step="0.01"
                      value={formData.cost}
                      onChange={(e) => setFormData({ ...formData, cost: parseFloat(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="is_service">É um serviço?</Label>
                  <Switch
                    id="is_service"
                    checked={formData.is_service}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_service: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="is_active">Ativo?</Label>
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">
                  {editingProduct ? 'Salvar' : 'Criar'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, SKU ou categoria..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="pl-8"
          />
        </div>
      </div>

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
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : paginatedProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  Nenhum produto encontrado
                </TableCell>
              </TableRow>
            ) : (
              paginatedProducts.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell>{product.sku || '-'}</TableCell>
                  <TableCell>{product.category || '-'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {product.is_service ? 'Serviço' : 'Produto'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(product.price)}</TableCell>
                  <TableCell className="text-right">
                    {product.cost ? formatCurrency(product.cost) : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    {calculateMargin(product.price, product.cost || 0)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={product.is_active ? 'default' : 'secondary'}>
                      {product.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(product)}
                        aria-label="Editar produto"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteClick(product.id)}
                        aria-label="Excluir produto"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
import { useState } from 'react';
import { useClients } from '@/hooks/useClients';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { useAuth } from '@/hooks/useAuth';
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
import { Plus, Search, Pencil, Trash2, ShieldAlert, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

const PAGE_SIZE = 25;

export default function Clients() {
  const { clients, loading, createClient, updateClient, deleteClient } = useClients();
  const { user, role } = useAuth();
  const { permissions } = useUserPermissions();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    document_number: '',
  });

  // Verificar permissão de acesso ao CRM
  const hasAccessToCRM = 
    role && ['super_admin', 'company_admin', 'manager'].includes(role) || 
    permissions.crm_access !== 'none';

  // Se não tem permissão, mostrar tela de acesso restrito
  if (!hasAccessToCRM) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardContent className="pt-6 text-center">
            <ShieldAlert className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Acesso Restrito</h2>
            <p className="text-sm text-muted-foreground">
              Você não tem permissão para acessar a página de Contatos.
              Entre em contato com seu administrador.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filteredClients = clients.filter(client => {
    const searchLower = searchTerm.toLowerCase();
    return (
      client.first_name?.toLowerCase().includes(searchLower) ||
      client.last_name?.toLowerCase().includes(searchLower) ||
      client.email?.toLowerCase().includes(searchLower) ||
      client.phone?.includes(searchLower)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedClients = filteredClients.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingClient) {
      await updateClient(editingClient.id, formData);
    } else {
      await createClient({ ...formData, created_by: user?.id });
    }
    
    setIsDialogOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      document_number: '',
    });
    setEditingClient(null);
  };

  const handleEdit = (client: any) => {
    setEditingClient(client);
    setFormData({
      first_name: client.first_name || '',
      last_name: client.last_name || '',
      email: client.email || '',
      phone: client.phone || '',
      document_number: client.document_number || '',
    });
    setIsDialogOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    setDeleteConfirm({ open: true, id });
  };

  const handleDeleteConfirm = async () => {
    if (deleteConfirm.id) {
      await deleteClient(deleteConfirm.id);
      setDeleteConfirm({ open: false, id: null });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">
            Gerencie sua base de clientes
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[525px]">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>
                  {editingClient ? 'Editar Cliente' : 'Novo Cliente'}
                </DialogTitle>
                <DialogDescription>
                  Preencha os dados do cliente
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="first_name">Nome *</Label>
                  <Input
                    id="first_name"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="last_name">Sobrenome</Label>
                  <Input
                    id="last_name"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="document_number">CPF/CNPJ</Label>
                  <Input
                    id="document_number"
                    value={formData.document_number}
                    onChange={(e) => setFormData({ ...formData, document_number: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">
                  {editingClient ? 'Salvar' : 'Criar'}
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
            placeholder="Buscar por nome, email ou telefone..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="pl-8"
          />
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : paginatedClients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  Nenhum cliente encontrado
                </TableCell>
              </TableRow>
            ) : (
              paginatedClients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">
                    {client.first_name} {client.last_name}
                  </TableCell>
                  <TableCell>{client.email || '-'}</TableCell>
                  <TableCell>{client.phone || '-'}</TableCell>
                  <TableCell>{client.document_number || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={client.is_active ? 'default' : 'secondary'}>
                      {client.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {format(new Date(client.created_at), 'dd/MM/yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(client)}
                        aria-label="Editar cliente"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteClick(client.id)}
                        aria-label="Excluir cliente"
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

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <p className="text-center py-8 text-muted-foreground">Carregando...</p>
        ) : paginatedClients.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">Nenhum cliente encontrado</p>
        ) : (
          paginatedClients.map((client) => (
            <Card key={client.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{client.first_name} {client.last_name}</p>
                    {client.phone && <p className="text-sm text-muted-foreground">{client.phone}</p>}
                    {client.email && <p className="text-sm text-muted-foreground truncate">{client.email}</p>}
                  </div>
                  <Badge variant={client.is_active ? 'default' : 'secondary'} className="shrink-0 text-[10px]">
                    {client.is_active ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(client.created_at), 'dd/MM/yyyy')}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(client)} aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteClick(client.id)} aria-label="Excluir">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-muted-foreground">
            {filteredClients.length} cliente(s) — Página {safePage} de {totalPages}
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
        title="Excluir Cliente"
        description="Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
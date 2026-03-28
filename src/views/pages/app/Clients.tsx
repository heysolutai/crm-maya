import { useState, useMemo } from 'react';
import { useClients } from '@/hooks/useClients';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Users,
  UserCheck,
  UserX,
  DollarSign,
  ContactRound,
} from 'lucide-react';
import { format } from 'date-fns';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { StatCards, type StatItem } from '@/components/ui/stat-cards';
import { TableSkeleton, CardListSkeleton } from '@/components/ui/table-skeleton';
import { EmptyState } from '@/components/ui/empty-state';

const PAGE_SIZE = 25;

const avatarColors = [
  'bg-emerald-500', 'bg-blue-500', 'bg-purple-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-pink-500',
];

function getInitials(firstName: string, lastName?: string) {
  const f = firstName?.[0] || '';
  const l = lastName?.[0] || '';
  return (f + l).toUpperCase() || '??';
}

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

export default function Clients() {
  const { clients, loading, createClient, updateClient, deleteClient } = useClients();
  const { user, role } = useAuth();
  const { permissions } = useUserPermissions();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
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

  const hasAccessToCRM =
    role && ['super_admin', 'company_admin', 'manager'].includes(role) ||
    permissions.crm_access !== 'none';

  // Stats calculados dos dados
  const stats = useMemo((): StatItem[] => {
    const active = clients.filter(c => c.is_active).length;
    const inactive = clients.filter(c => !c.is_active).length;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentClients = clients.filter(c => new Date(c.created_at) >= thirtyDaysAgo).length;
    const totalRevenue = clients.reduce((sum, c) => sum + ((c as any).total_revenue || 0), 0);

    return [
      { label: 'Total de Clientes', value: clients.length, icon: Users, color: 'blue' },
      { label: 'Ativos', value: active, icon: UserCheck, color: 'green' },
      { label: 'Novos (30 dias)', value: recentClients, icon: ContactRound, color: 'purple' },
      {
        label: 'Receita Total',
        value: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(totalRevenue),
        icon: DollarSign,
        color: 'cyan',
      },
    ];
  }, [clients]);

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
    const matchesSearch =
      client.first_name?.toLowerCase().includes(searchLower) ||
      client.last_name?.toLowerCase().includes(searchLower) ||
      client.email?.toLowerCase().includes(searchLower) ||
      client.phone?.includes(searchLower);
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && client.is_active) ||
      (statusFilter === 'inactive' && !client.is_active);
    return matchesSearch && matchesStatus;
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
    setFormData({ first_name: '', last_name: '', email: '', phone: '', document_number: '' });
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">Gerencie sua base de clientes</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[525px]">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>{editingClient ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
                <DialogDescription>Preencha os dados do cliente</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="first_name">Nome *</Label>
                    <Input id="first_name" placeholder="João" value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="last_name">Sobrenome</Label>
                    <Input id="last_name" placeholder="Silva" value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="joao@email.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input id="phone" placeholder="(11) 99999-9999" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="document_number">CPF/CNPJ</Label>
                    <Input id="document_number" placeholder="000.000.000-00" value={formData.document_number} onChange={(e) => setFormData({ ...formData, document_number: e.target.value })} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">{editingClient ? 'Salvar' : 'Criar'}</Button>
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
            placeholder="Buscar por nome, email ou telefone..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'active', 'inactive'] as const).map((filter) => (
            <Button
              key={filter}
              variant={statusFilter === filter ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setStatusFilter(filter); setCurrentPage(1); }}
              className="text-xs"
            >
              {filter === 'all' ? 'Todos' : filter === 'active' ? 'Ativos' : 'Inativos'}
            </Button>
          ))}
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        {loading ? (
          <TableSkeleton columns={7} rows={8} headers={['Nome', 'Email', 'Telefone', 'Documento', 'Status', 'Criado em', 'Ações']} />
        ) : paginatedClients.length === 0 ? (
          <EmptyState
            icon={ContactRound}
            title={searchTerm || statusFilter !== 'all' ? 'Nenhum resultado encontrado' : 'Nenhum cliente cadastrado'}
            description={searchTerm || statusFilter !== 'all' ? 'Tente ajustar os filtros ou o termo de busca.' : 'Comece adicionando seu primeiro cliente para gerenciar seus contatos.'}
            actionLabel={!searchTerm && statusFilter === 'all' ? 'Adicionar Cliente' : undefined}
            onAction={!searchTerm && statusFilter === 'all' ? () => setIsDialogOpen(true) : undefined}
          />
        ) : (
          <div className="rounded-md border">
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
                {paginatedClients.map((client) => (
                  <TableRow key={client.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className={`${getAvatarColor(client.first_name)} text-white text-xs`}>
                            {getInitials(client.first_name, client.last_name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{client.first_name} {client.last_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{client.email || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{client.phone || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{client.document_number || '-'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${client.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                        <span className="text-xs">{client.is_active ? 'Ativo' : 'Inativo'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(client.created_at), 'dd/MM/yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(client)} aria-label="Editar cliente">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteClick(client.id)} aria-label="Excluir cliente">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden">
        {loading ? (
          <CardListSkeleton count={5} />
        ) : paginatedClients.length === 0 ? (
          <EmptyState
            icon={ContactRound}
            title={searchTerm ? 'Nenhum resultado' : 'Nenhum cliente'}
            description={searchTerm ? 'Ajuste sua busca.' : 'Adicione seu primeiro cliente.'}
            actionLabel={!searchTerm ? 'Adicionar' : undefined}
            onAction={!searchTerm ? () => setIsDialogOpen(true) : undefined}
          />
        ) : (
          <div className="space-y-3">
            {paginatedClients.map((client) => (
              <Card key={client.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className={`${getAvatarColor(client.first_name)} text-white text-xs`}>
                        {getInitials(client.first_name, client.last_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{client.first_name} {client.last_name}</p>
                      {client.phone && <p className="text-sm text-muted-foreground">{client.phone}</p>}
                      {client.email && <p className="text-sm text-muted-foreground truncate">{client.email}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`h-2 w-2 rounded-full ${client.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                      <span className="text-[10px] text-muted-foreground">{client.is_active ? 'Ativo' : 'Inativo'}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(client.created_at), 'dd/MM/yyyy')}
                    </span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(client)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteClick(client.id)} aria-label="Excluir">
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

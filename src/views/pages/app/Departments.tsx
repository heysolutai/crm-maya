import { useState } from 'react';
import { useDepartments, type Department } from '@/hooks/useDepartments';
import { useTeam } from '@/hooks/useTeam';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  UserPlus,
  UserMinus,
  Users,
  Building2,
} from 'lucide-react';

export default function Departments() {
  const {
    departments,
    loading,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    addMember,
    removeMember,
  } = useDepartments();
  const { teamMembers } = useTeam();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [selectedMemberUserId, setSelectedMemberUserId] = useState('');

  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    color: '#6366f1',
  });

  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    color: '#6366f1',
  });

  const handleCreate = async () => {
    const result = await createDepartment(createForm);
    if (result) {
      setIsCreateOpen(false);
      setCreateForm({ name: '', description: '', color: '#6366f1' });
    }
  };

  const handleEdit = async () => {
    if (!selectedDept) return;
    const success = await updateDepartment(selectedDept.id, editForm);
    if (success) {
      setIsEditOpen(false);
      setSelectedDept(null);
    }
  };

  const handleDelete = async (dept: Department) => {
    if (confirm(`Deseja desativar o departamento "${dept.name}"?`)) {
      await deleteDepartment(dept.id);
    }
  };

  const openEdit = (dept: Department) => {
    setSelectedDept(dept);
    setEditForm({
      name: dept.name,
      description: dept.description || '',
      color: dept.color,
    });
    setIsEditOpen(true);
  };

  const openAddMember = (dept: Department) => {
    setSelectedDept(dept);
    setSelectedMemberUserId('');
    setIsAddMemberOpen(true);
  };

  const handleAddMember = async () => {
    if (!selectedDept || !selectedMemberUserId) return;
    const success = await addMember(selectedDept.id, selectedMemberUserId);
    if (success) {
      setIsAddMemberOpen(false);
      setSelectedMemberUserId('');
    }
  };

  const handleRemoveMember = async (deptId: string, userId: string, userName: string) => {
    if (confirm(`Remover "${userName}" do departamento?`)) {
      await removeMember(deptId, userId);
    }
  };

  // Members already in a department (for filtering the add member dropdown)
  const getMemberIds = (dept: Department) =>
    (dept.department_members || []).map(m => m.user_id);

  const getAvailableMembers = (dept: Department) => {
    const existingIds = getMemberIds(dept);
    return (teamMembers || []).filter(m => !existingIds.includes(m.id));
  };

  const getMemberName = (userId: string) => {
    const member = (teamMembers || []).find((m: any) => m.id === userId);
    return member?.full_name || member?.email || 'Desconhecido';
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Departamentos</h1>
          <p className="text-muted-foreground text-sm">Gerencie os departamentos e seus membros</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Departamentos</h1>
          <p className="text-muted-foreground text-sm">Gerencie os departamentos e seus membros</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Novo Departamento
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Departamento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input
                  value={createForm.name}
                  onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="Ex: Vendas, Suporte, Financeiro"
                />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  value={createForm.description}
                  onChange={e => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Descrição do departamento..."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Cor</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="color"
                    value={createForm.color}
                    onChange={e => setCreateForm({ ...createForm, color: e.target.value })}
                    className="w-12 h-10 p-1 cursor-pointer"
                  />
                  <span className="text-sm text-muted-foreground">{createForm.color}</span>
                </div>
              </div>
              <Button onClick={handleCreate} className="w-full" disabled={!createForm.name.trim()}>
                Criar Departamento
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Empty state */}
      {departments.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold">Nenhum departamento</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Crie departamentos para organizar sua equipe e distribuir atendimentos.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Department cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {departments.map(dept => (
          <Card key={dept.id} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full shrink-0"
                    style={{ backgroundColor: dept.color }}
                  />
                  <div>
                    <CardTitle className="text-base">{dept.name}</CardTitle>
                    {dept.description && (
                      <CardDescription className="text-xs mt-0.5">
                        {dept.description}
                      </CardDescription>
                    )}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(dept)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openAddMember(dept)}>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Adicionar Membro
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDelete(dept)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Desativar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {dept.department_members?.length || 0} membros
                </span>
              </div>
              <div className="space-y-2">
                {(dept.department_members || []).length === 0 && (
                  <p className="text-xs text-muted-foreground italic">Nenhum membro ainda</p>
                )}
                {(dept.department_members || []).map(member => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-md bg-muted/50"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-[10px]">
                          {getMemberName(member.user_id).charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm truncate">{getMemberName(member.user_id)}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {member.role}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() =>
                        handleRemoveMember(dept.id, member.user_id, getMemberName(member.user_id))
                      }
                    >
                      <UserMinus className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Departamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={editForm.name}
                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={editForm.description}
                onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="color"
                  value={editForm.color}
                  onChange={e => setEditForm({ ...editForm, color: e.target.value })}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
                <span className="text-sm text-muted-foreground">{editForm.color}</span>
              </div>
            </div>
            <Button onClick={handleEdit} className="w-full" disabled={!editForm.name.trim()}>
              Salvar Alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Membro — {selectedDept?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Membro da equipe</Label>
              <Select value={selectedMemberUserId} onValueChange={setSelectedMemberUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um membro..." />
                </SelectTrigger>
                <SelectContent>
                  {selectedDept && getAvailableMembers(selectedDept).length === 0 && (
                    <SelectItem value="_none" disabled>
                      Todos os membros já estão neste departamento
                    </SelectItem>
                  )}
                  {selectedDept &&
                    getAvailableMembers(selectedDept).map((member: any) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.full_name || member.email}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleAddMember}
              className="w-full"
              disabled={!selectedMemberUserId || selectedMemberUserId === '_none'}
            >
              Adicionar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

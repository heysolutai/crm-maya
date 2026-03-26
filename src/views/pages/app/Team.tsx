import { useState } from 'react';
import { useTeam } from '@/hooks/useTeam';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { UserPlus, Search, Shield, User, Eye, Crown, MoreVertical } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const roleLabels = {
  company_admin: { label: 'Administrador', icon: Crown, color: 'text-yellow-500' },
  manager: { label: 'Gerente', icon: Shield, color: 'text-blue-500' },
  agent: { label: 'Agente', icon: User, color: 'text-green-500' },
  viewer: { label: 'Visualizador', icon: Eye, color: 'text-gray-500' },
};

export default function Team() {
  const { teamMembers, isLoading, inviteMember, updateMemberRole, toggleMemberStatus } = useTeam();
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    phone: '',
    role: 'agent' as 'company_admin' | 'manager' | 'agent' | 'viewer',
  });

  const filteredMembers = teamMembers?.filter(member =>
    member.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    member.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleInvite = () => {
    inviteMember(formData);
    setIsDialogOpen(false);
    setFormData({ email: '', full_name: '', phone: '', role: 'agent' });
  };

  const getInitials = (name: string) => {
    if (!name) return '??';
    const parts = name.split(' ');
    return parts.length > 1 
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Equipe</h1>
          <p className="text-muted-foreground text-sm">Gerencie os membros da sua equipe</p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              Convidar Membro
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Convidar Novo Membro</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Nome Completo *</Label>
                <Input
                  id="full_name"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="João Silva"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="joao@empresa.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(11) 99999-9999"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Função *</Label>
                <Select value={formData.role} onValueChange={(value: any) => setFormData({ ...formData, role: value })}>
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Visualizador</SelectItem>
                    <SelectItem value="agent">Agente</SelectItem>
                    <SelectItem value="manager">Gerente</SelectItem>
                    <SelectItem value="company_admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleInvite} className="w-full" disabled={!formData.email || !formData.full_name}>
                Enviar Convite
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Desktop table */}
      <div className="hidden md:block border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Membro</TableHead>
              <TableHead>Função</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Último Acesso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : filteredMembers?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  Nenhum membro encontrado
                </TableCell>
              </TableRow>
            ) : (
              filteredMembers?.map((member) => {
                const userRole = Array.isArray(member.user_roles) ? member.user_roles[0] : member.user_roles;
                const role = (userRole as any)?.role || 'viewer';
                const roleInfo = roleLabels[role as keyof typeof roleLabels];
                const RoleIcon = roleInfo.icon;

                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>{getInitials(member.full_name || member.email)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{member.full_name || 'Sem nome'}</div>
                          <div className="text-sm text-muted-foreground">{member.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <RoleIcon className={`h-4 w-4 ${roleInfo.color}`} />
                        <Select
                          value={role}
                          onValueChange={(value) => updateMemberRole({ userId: member.id, role: value as any })}
                        >
                          <SelectTrigger className="w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="viewer">Visualizador</SelectItem>
                            <SelectItem value="agent">Agente</SelectItem>
                            <SelectItem value="manager">Gerente</SelectItem>
                            <SelectItem value="company_admin">Administrador</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={member.is_active}
                          onCheckedChange={(checked) => toggleMemberStatus({ userId: member.id, isActive: checked })}
                        />
                        <Badge variant={member.is_active ? 'default' : 'secondary'}>
                          {member.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      {member.last_seen_at
                        ? format(new Date(member.last_seen_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                        : 'Nunca'}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <p className="text-center py-8 text-muted-foreground">Carregando...</p>
        ) : filteredMembers?.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">Nenhum membro encontrado</p>
        ) : (
          filteredMembers?.map((member) => {
            const userRole = Array.isArray(member.user_roles) ? member.user_roles[0] : member.user_roles;
            const memberRole = (userRole as any)?.role || 'viewer';
            const roleInfo = roleLabels[memberRole as keyof typeof roleLabels];
            const RoleIcon = roleInfo.icon;

            return (
              <Card key={member.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>{getInitials(member.full_name || member.email)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{member.full_name || 'Sem nome'}</p>
                      <p className="text-sm text-muted-foreground truncate">{member.email}</p>
                    </div>
                    <Badge variant={member.is_active ? 'default' : 'secondary'} className="shrink-0 text-[10px]">
                      {member.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                    <div className="flex items-center gap-2">
                      <RoleIcon className={`h-4 w-4 ${roleInfo.color}`} />
                      <Select
                        value={memberRole}
                        onValueChange={(value) => updateMemberRole({ userId: member.id, role: value as any })}
                      >
                        <SelectTrigger className="w-[140px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Visualizador</SelectItem>
                          <SelectItem value="agent">Agente</SelectItem>
                          <SelectItem value="manager">Gerente</SelectItem>
                          <SelectItem value="company_admin">Administrador</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Switch
                      checked={member.is_active}
                      onCheckedChange={(checked) => toggleMemberStatus({ userId: member.id, isActive: checked })}
                    />
                  </div>
                  {member.last_seen_at && (
                    <p className="text-[11px] text-muted-foreground mt-2">
                      Último acesso: {format(new Date(member.last_seen_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

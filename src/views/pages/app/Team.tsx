import { useState, useMemo } from 'react';
import { useTeam } from '@/hooks/useTeam';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { UserPlus, Search, Shield, User, Eye, Crown, Users, UserCheck, UserX, Clock, MoreVertical, KeyRound, Loader2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { StatCards, type StatItem } from '@/components/ui/stat-cards';
import { TableSkeleton, CardListSkeleton } from '@/components/ui/table-skeleton';
import { EmptyState } from '@/components/ui/empty-state';

const roleLabels = {
  company_admin: { label: 'Administrador', icon: Crown, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-500/10' },
  manager: { label: 'Gerente', icon: Shield, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' },
  agent: { label: 'Agente', icon: User, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
  viewer: { label: 'Visualizador', icon: Eye, color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-500/10' },
};

const avatarColors = [
  'bg-emerald-500', 'bg-blue-500', 'bg-purple-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-pink-500',
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

export default function Team() {
  const { teamMembers, isLoading, inviteMember, updateMemberRole, toggleMemberStatus, setPassword, isSettingPassword } = useTeam();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<{ id: string; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    phone: '',
    role: 'agent' as 'company_admin' | 'manager' | 'agent' | 'viewer',
  });

  const handleSetPassword = async () => {
    setPasswordError('');
    if (newPassword.length < 8) {
      setPasswordError('A senha deve ter no mínimo 8 caracteres');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('As senhas não coincidem');
      return;
    }
    if (!passwordTarget) return;
    try {
      await setPassword({ userId: passwordTarget.id, password: newPassword });
      setPasswordTarget(null);
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      // toast já exibido pelo hook
    }
  };

  const stats = useMemo((): StatItem[] => {
    const members = teamMembers || [];
    const active = members.filter((m: typeof members[0]) => m.is_active).length;
    const inactive = members.length - active;

    // Membros que acessaram nas últimas 24h
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentlyActive = members.filter((m: typeof members[0]) => m.last_seen_at && new Date(m.last_seen_at) >= oneDayAgo).length;

    return [
      { label: 'Total Membros', value: members.length, icon: Users, color: 'blue' },
      { label: 'Ativos', value: active, icon: UserCheck, color: 'green' },
      { label: 'Inativos', value: inactive, icon: UserX, color: 'red' },
      { label: 'Online (24h)', value: recentlyActive, icon: Clock, color: 'cyan' },
    ];
  }, [teamMembers]);

  const filteredMembers = (teamMembers || []).filter((member: typeof teamMembers[0]) => {
    const matchesSearch =
      member.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      member.email?.toLowerCase().includes(search.toLowerCase());
    if (roleFilter === 'all') return matchesSearch;
    const userRole = Array.isArray(member.user_roles) ? member.user_roles[0] : member.user_roles;
    const role = (userRole as any)?.role || 'viewer';
    return matchesSearch && role === roleFilter;
  });

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
      {/* Header */}
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
                <Input id="full_name" value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} placeholder="João Silva" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="joao@empresa.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="(11) 99999-9999" />
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

      {/* Stat Cards */}
      <StatCards items={stats} loading={isLoading} />

      {/* Search + Filter */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          {[
            { key: 'all', label: 'Todos' },
            { key: 'company_admin', label: 'Admins' },
            { key: 'manager', label: 'Gerentes' },
            { key: 'agent', label: 'Agentes' },
          ].map(({ key, label }) => (
            <Button
              key={key}
              variant={roleFilter === key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRoleFilter(key)}
              className="text-xs hidden sm:inline-flex"
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        {isLoading ? (
          <TableSkeleton columns={4} rows={6} headers={['Membro', 'Função', 'Status', 'Último Acesso']} />
        ) : filteredMembers.length === 0 ? (
          <EmptyState
            icon={Users}
            title={search || roleFilter !== 'all' ? 'Nenhum resultado encontrado' : 'Nenhum membro na equipe'}
            description={search || roleFilter !== 'all' ? 'Tente ajustar os filtros ou busca.' : 'Convide membros para começar a gerenciar sua equipe.'}
            actionLabel={!search && roleFilter === 'all' ? 'Convidar Membro' : undefined}
            onAction={!search && roleFilter === 'all' ? () => setIsDialogOpen(true) : undefined}
          />
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Membro</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Último Acesso</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.map((member: typeof filteredMembers[0]) => {
                  const userRole = Array.isArray(member.user_roles) ? member.user_roles[0] : member.user_roles;
                  const role = (userRole as any)?.role || 'viewer';
                  const roleInfo = roleLabels[role as keyof typeof roleLabels];
                  const RoleIcon = roleInfo.icon;

                  return (
                    <TableRow key={member.id} className="group">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <Avatar>
                              <AvatarFallback className={`${getAvatarColor(member.full_name || member.email)} text-white text-xs`}>
                                {getInitials(member.full_name || member.email)}
                              </AvatarFallback>
                            </Avatar>
                            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${member.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                          </div>
                          <div>
                            <div className="font-medium">{member.full_name || 'Sem nome'}</div>
                            <div className="text-sm text-muted-foreground">{member.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={`rounded-md p-1 ${roleInfo.bg}`}>
                            <RoleIcon className={`h-3.5 w-3.5 ${roleInfo.color}`} />
                          </div>
                          <Select
                            value={role}
                            onValueChange={(value) => updateMemberRole({ userId: member.id, role: value as any })}
                          >
                            <SelectTrigger className="w-[150px] h-8 text-sm">
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
                          <span className="text-xs text-muted-foreground">
                            {member.is_active ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {member.last_seen_at
                          ? format(new Date(member.last_seen_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                          : <span className="text-xs italic">Nunca acessou</span>}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setPasswordTarget({ id: member.id, name: member.full_name || member.email })}
                            >
                              <KeyRound className="h-4 w-4 mr-2" />
                              Redefinir senha
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
        {isLoading ? (
          <CardListSkeleton count={5} />
        ) : filteredMembers.length === 0 ? (
          <EmptyState
            icon={Users}
            title={search ? 'Nenhum resultado' : 'Nenhum membro'}
            description={search ? 'Ajuste sua busca.' : 'Convide membros para a equipe.'}
            actionLabel={!search ? 'Convidar' : undefined}
            onAction={!search ? () => setIsDialogOpen(true) : undefined}
          />
        ) : (
          <div className="space-y-3">
            {filteredMembers.map((member: typeof filteredMembers[0]) => {
              const userRole = Array.isArray(member.user_roles) ? member.user_roles[0] : member.user_roles;
              const memberRole = (userRole as any)?.role || 'viewer';
              const roleInfo = roleLabels[memberRole as keyof typeof roleLabels];
              const RoleIcon = roleInfo.icon;

              return (
                <Card key={member.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className={`${getAvatarColor(member.full_name || member.email)} text-white text-xs`}>
                            {getInitials(member.full_name || member.email)}
                          </AvatarFallback>
                        </Avatar>
                        <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${member.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{member.full_name || 'Sem nome'}</p>
                        <p className="text-sm text-muted-foreground truncate">{member.email}</p>
                      </div>
                      <div className={`rounded-md p-1.5 shrink-0 ${roleInfo.bg}`}>
                        <RoleIcon className={`h-4 w-4 ${roleInfo.color}`} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
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
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={member.is_active}
                          onCheckedChange={(checked) => toggleMemberStatus({ userId: member.id, isActive: checked })}
                        />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setPasswordTarget({ id: member.id, name: member.full_name || member.email })}
                            >
                              <KeyRound className="h-4 w-4 mr-2" />
                              Redefinir senha
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    {member.last_seen_at && (
                      <p className="text-[11px] text-muted-foreground mt-2">
                        Último acesso: {format(new Date(member.last_seen_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog de redefinir senha */}
      <Dialog
        open={!!passwordTarget}
        onOpenChange={(open) => {
          if (!open) {
            setPasswordTarget(null);
            setNewPassword('');
            setConfirmPassword('');
            setPasswordError('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
            <DialogDescription>
              Defina uma nova senha para <span className="font-medium">{passwordTarget?.name}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova senha</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar senha</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a senha"
                autoComplete="new-password"
              />
            </div>
            {passwordError && (
              <p className="text-sm text-destructive">{passwordError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordTarget(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSetPassword}
              disabled={isSettingPassword || !newPassword || !confirmPassword}
            >
              {isSettingPassword && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar senha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

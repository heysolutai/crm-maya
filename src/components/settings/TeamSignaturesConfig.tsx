import { apiFetch } from '@/lib/api/client';
import { useState, useMemo } from 'react';
import { useTeam } from '@/hooks/useTeam';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Loader2, Pencil, MessageSquare } from 'lucide-react';
import { EditSignatureDialog } from './EditSignatureDialog';
import { Badge } from '@/components/ui/badge';

interface AgentWithSignature {
  id: string;
  full_name: string | null;
  email: string;
  signature: string;
}

export function TeamSignaturesConfig() {
  const { teamMembers, isLoading: isLoadingTeam } = useTeam();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [editingAgent, setEditingAgent] = useState<AgentWithSignature | null>(null);

  // Filtrar membros que podem ter assinaturas (todos exceto viewers)
  const agents = useMemo(() =>
    teamMembers?.filter((member: typeof teamMembers[0]) => {
      const roles = member.user_roles || [];
      return roles.some((ur: any) => ['company_admin', 'manager', 'agent'].includes(ur.role));
    }) || []
  , [teamMembers]);

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email.slice(0, 2).toUpperCase();
  };

  const getRoleBadge = (roles: any[]) => {
    const role = roles?.[0]?.role;
    switch (role) {
      case 'company_admin':
        return <Badge variant="default">Admin</Badge>;
      case 'manager':
        return <Badge variant="secondary">Gerente</Badge>;
      case 'agent':
        return <Badge variant="outline">Agente</Badge>;
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  const handleSaveSignature = async (signature: string) => {
    if (!editingAgent) return;

    try {
      // Get current settings first
      const getRes = await apiFetch(`/api/user-settings?userId=${editingAgent.id}`);
      const currentSettings = getRes.ok ? await getRes.json() : {};

      const updatedSettings = {
        permissions: {
          ...(currentSettings.permissions || {}),
          message_signature: signature,
        },
      };

      const res = await apiFetch('/api/user-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingAgent.id,
          settings: updatedSettings,
        }),
      });
      if (!res.ok) throw new Error('Failed to update');

      queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
      queryClient.invalidateQueries({ queryKey: ['team'] });

      toast({ title: 'Assinatura atualizada' });
    } catch (err) {
      toast({ title: 'Erro ao atualizar assinatura', variant: 'destructive' });
    }
    setEditingAgent(null);
  };

  if (isLoadingTeam) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="text-center py-8">
        <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Nenhum membro da equipe encontrado.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Membro</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Assinatura</TableHead>
            <TableHead className="w-16">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {agents.map((agent: typeof agents[0]) => (
            <AgentSignatureRow
              key={agent.id}
              agent={agent}
              onEditSignature={(agentWithSig: AgentWithSignature) => setEditingAgent(agentWithSig)}
              getInitials={getInitials}
              getRoleBadge={getRoleBadge}
            />
          ))}
        </TableBody>
      </Table>

      {editingAgent && (
        <EditSignatureDialog 
          open={!!editingAgent}
          onOpenChange={(open) => !open && setEditingAgent(null)}
          agentName={editingAgent.full_name || editingAgent.email}
          currentSignature={editingAgent.signature}
          onSave={handleSaveSignature}
        />
      )}
    </div>
  );
}

interface AgentSignatureRowProps {
  agent: any;
  onEditSignature: (agent: AgentWithSignature) => void;
  getInitials: (name: string | null, email: string) => string;
  getRoleBadge: (roles: any[]) => JSX.Element;
}

function AgentSignatureRow({ 
  agent, 
  onEditSignature,
  getInitials,
  getRoleBadge,
}: AgentSignatureRowProps) {
  const settings = agent.settings as any;
  const signature = settings?.permissions?.message_signature || agent.full_name || '';

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs">
              {getInitials(agent.full_name, agent.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{agent.full_name || agent.email}</p>
            <p className="text-xs text-muted-foreground truncate">{agent.email}</p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        {getRoleBadge(agent.user_roles || [])}
      </TableCell>
      <TableCell>
        <span className="text-sm text-muted-foreground truncate block max-w-[200px]">
          {signature || '-'}
        </span>
      </TableCell>
      <TableCell>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8"
          onClick={() => onEditSignature({
            id: agent.id,
            full_name: agent.full_name,
            email: agent.email,
            signature,
          })}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

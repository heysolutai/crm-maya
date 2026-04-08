import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Bot, Pause, Users } from 'lucide-react';
import { useClientsForCompany } from '@/hooks/useClientsForCompany';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ClientsTabProps {
  companyId: string;
}

export function ClientsTab({ companyId }: ClientsTabProps) {
  const { clients, isLoading, toggleAIPaused } = useClientsForCompany(companyId);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredClients = clients.filter(client => {
    const searchLower = searchTerm.toLowerCase();
    return (
      client.first_name?.toLowerCase().includes(searchLower) ||
      client.last_name?.toLowerCase().includes(searchLower) ||
      client.phone?.includes(searchTerm) ||
      client.email?.toLowerCase().includes(searchLower)
    );
  });

  const getInitials = (firstName: string, lastName?: string | null) => {
    const first = firstName?.charAt(0) || '';
    const last = lastName?.charAt(0) || '';
    return (first + last).toUpperCase() || '?';
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="ml-2 text-muted-foreground">Carregando clientes...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Contatos da Empresa
        </CardTitle>
        <CardDescription>
          Gerencie os contatos e controle o status da IA para cada cliente
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone ou email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Stats */}
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{clients.length} contatos</span>
          <span>•</span>
          <span>{clients.filter(c => c.ai_paused).length} com IA pausada</span>
        </div>

        {/* Table */}
        {filteredClients.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            {searchTerm ? 'Nenhum cliente encontrado para a busca' : 'Nenhum cliente cadastrado'}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status IA</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={client.avatar_url || undefined} />
                          <AvatarFallback className="text-xs">
                            {getInitials(client.first_name, client.last_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">
                            {client.first_name} {client.last_name || ''}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {client.phone || '-'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {client.email || '-'}
                    </TableCell>
                    <TableCell>
                      {client.ai_paused ? (
                        <Badge variant="secondary" className="gap-1">
                          <Pause className="h-3 w-3" />
                          Pausada
                        </Badge>
                      ) : (
                        <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-700">
                          <Bot className="h-3 w-3" />
                          Ativa
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {client.created_at ? format(new Date(client.created_at), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR }) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-muted-foreground">
                          {client.ai_paused ? 'Ativar IA' : 'Pausar IA'}
                        </span>
                        <Switch
                          checked={!client.ai_paused}
                          onCheckedChange={() => toggleAIPaused(client.id, client.ai_paused)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

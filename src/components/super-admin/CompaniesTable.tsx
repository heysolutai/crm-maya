import { apiFetch } from '@/lib/api/client';
import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, Building2, Trash2, ExternalLink, ChevronLeft, ChevronRight, MessageCircle, CheckCircle2, AlertTriangle, Clock, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Company, useCompanies } from '@/hooks/useCompanies';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useImpersonation } from '@/hooks/useImpersonation';
import { useQuery } from '@tanstack/react-query';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const ITEMS_PER_PAGE = 10;

const formatMemoryName = (name: string): string => {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
};

const getInitials = (name: string): string => {
  return name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
};

const AVATAR_COLORS = [
  'bg-blue-500/20 text-blue-400',
  'bg-emerald-500/20 text-emerald-400',
  'bg-amber-500/20 text-amber-400',
  'bg-rose-500/20 text-rose-400',
  'bg-purple-500/20 text-purple-400',
  'bg-cyan-500/20 text-cyan-400',
];

type SortKey = 'name' | 'status' | 'problema' | 'expiration' | 'email';
type SortDir = 'asc' | 'desc';

interface CompaniesTableProps {
  companies: Company[];
  searchTerm: string;
  onSearchChange: (value: string) => void;
  totalCount: number;
}

export function CompaniesTable({ companies, searchTerm, onSearchChange, totalCount }: CompaniesTableProps) {
  const router = useRouter();
  const { startImpersonation } = useImpersonation();
  const { deleteCompany, isDeleting } = useCompanies();
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Fetch open support tickets grouped by company
  const { data: ticketCounts } = useQuery({
    queryKey: ['support-ticket-counts'],
    queryFn: async () => {
      const res = await apiFetch('/api/support-tickets?counts=true');
      if (!res.ok) throw new Error('Failed to fetch ticket counts');
      return await res.json();
    },
  });

  const getTicketStatus = (companyId: string) => {
    const count = ticketCounts?.[companyId];
    if (!count) return { label: 'OK', icon: CheckCircle2, className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
    if (count.open > 0) return { label: `${count.open} Aberto${count.open > 1 ? 's' : ''}`, icon: AlertTriangle, className: 'bg-rose-500/15 text-rose-400 border-rose-500/30' };
    return { label: `${count.in_progress} Tratando`, icon: Clock, className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortKey(null); setSortDir('asc'); }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setCurrentPage(0);
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1 text-primary" /> : <ArrowDown className="h-3 w-3 ml-1 text-primary" />;
  };

  const getTicketSortValue = (companyId: string): number => {
    const count = ticketCounts?.[companyId];
    if (!count) return 0;
    if (count.open > 0) return 2;
    return 1;
  };

  const getTicketOldest = (companyId: string): string => {
    return ticketCounts?.[companyId]?.oldest || '9999';
  };

  const getExpirationDate = (company: Company): string => {
    if (company.subscription_status === 'trial') return company.trial_ends_at || '9999';
    return company.subscription_expires_at || '9999';
  };

  const getStatusOrder = (company: Company): number => {
    const setupPending = (company.settings as any)?.setup_completed !== true;
    if (setupPending && company.subscription_status === 'trial') return 0;
    const map: Record<string, number> = { trial: 1, active: 2, cancelled: 3, suspended: 4 };
    return map[company.subscription_status] ?? 5;
  };

  const sortedCompanies = [...companies].sort((a, b) => {
    if (!sortKey) return 0;
    let cmp = 0;
    switch (sortKey) {
      case 'name':
        cmp = a.name.localeCompare(b.name);
        break;
      case 'email':
        cmp = (a.email || '').localeCompare(b.email || '');
        break;
      case 'status':
        cmp = getStatusOrder(a) - getStatusOrder(b);
        break;
      case 'problema': {
        const va = getTicketSortValue(a.id);
        const vb = getTicketSortValue(b.id);
        cmp = va !== vb ? vb - va : getTicketOldest(a.id).localeCompare(getTicketOldest(b.id));
        break;
      }
      case 'expiration':
        cmp = getExpirationDate(a).localeCompare(getExpirationDate(b));
        break;
    }
    return sortDir === 'desc' ? -cmp : cmp;
  });

  const totalPages = Math.ceil(sortedCompanies.length / ITEMS_PER_PAGE);
  const paginatedCompanies = sortedCompanies.slice(
    currentPage * ITEMS_PER_PAGE,
    (currentPage + 1) * ITEMS_PER_PAGE
  );

  const handleImpersonate = (company: Company) => {
    startImpersonation(company.id, company.name);
    router.push('/app/dashboard');
  };

  const handleDelete = () => {
    if (companyToDelete) {
      deleteCompany(companyToDelete.id);
      setCompanyToDelete(null);
    }
  };

  const getStatusConfig = (company: Company) => {
    const setupPending = (company.settings as any)?.setup_completed !== true;

    if (setupPending && company.subscription_status === 'trial') {
      return { label: 'Setup Pendente', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
    }

    const map: Record<string, { label: string; className: string }> = {
      trial: { label: 'Trial', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
      active: { label: 'Ativo', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
      cancelled: { label: 'Expirado', className: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
      suspended: { label: 'Suspenso', className: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
    };

    return map[company.subscription_status] || { label: 'Desconhecido', className: 'bg-muted text-muted-foreground' };
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return format(new Date(dateString), "dd MMM, yyyy", { locale: ptBR });
  };

  if (companies.length === 0 && !searchTerm) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Nenhuma empresa encontrada</h3>
        <p className="text-sm text-muted-foreground">
          Crie sua primeira empresa usando o botão acima
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="px-6 py-4 border-b border-border/30">
        <input
          type="text"
          placeholder="Buscar por nome, nome fantasia ou email..."
          value={searchTerm}
          onChange={(e) => {
            onSearchChange(e.target.value);
            setCurrentPage(0);
          }}
          className="w-full max-w-sm bg-muted/50 border border-border/40 rounded-xl px-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
        />
      </div>
      {/* Mobile: Card layout */}
      <div className="md:hidden divide-y divide-border/20">
        {paginatedCompanies.map((company, index) => {
          const status = getStatusConfig(company);
          const colorClass = AVATAR_COLORS[index % AVATAR_COLORS.length];

          return (
            <div key={company.id} className="p-4 flex items-center gap-3">
              <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${colorClass}`}>
                {getInitials(company.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{company.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className={`text-[10px] font-medium rounded-full px-2 py-0 border ${status.className}`}>
                    {status.label}
                  </Badge>
                  {(() => {
                    const ticket = getTicketStatus(company.id);
                    const Icon = ticket.icon;
                    return (
                      <button
                        onClick={(e) => {
                          if (ticket.label !== 'OK') {
                            e.stopPropagation();
                            startImpersonation(company.id, company.name);
                            router.push('/app/support');
                          }
                        }}
                        className={ticket.label !== 'OK' ? 'cursor-pointer' : 'cursor-default'}
                      >
                        <Badge variant="outline" className={`text-[10px] font-medium rounded-full px-2 py-0 border ${ticket.className}`}>
                          <Icon className="h-3 w-3 mr-1" />
                          {ticket.label}
                        </Badge>
                      </button>
                    );
                  })()}
                </div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-xl text-muted-foreground hover:text-primary"
                  onClick={() => router.push(`/super-admin/companies/${company.id}`)}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-xl text-muted-foreground hover:text-primary"
                  onClick={() => handleImpersonate(company)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                {company.whatsapp_phone && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-xl text-muted-foreground hover:text-emerald-400"
                    onClick={() => window.open(`https://wa.me/${company.whatsapp_phone}`, '_blank')}
                  >
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-xl text-muted-foreground hover:text-destructive"
                  onClick={() => setCompanyToDelete(company)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: Table layout */}
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow className="border-border/30 hover:bg-transparent">
            <TableHead className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort('name')}>
              <span className="flex items-center">Empresa <SortIcon col="name" /></span>
            </TableHead>
            <TableHead className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">IA Memory</TableHead>
            <TableHead className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort('email')}>
              <span className="flex items-center">Email de Contato <SortIcon col="email" /></span>
            </TableHead>
            <TableHead className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort('status')}>
              <span className="flex items-center">Status <SortIcon col="status" /></span>
            </TableHead>
            <TableHead className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort('problema')}>
              <span className="flex items-center">Problema <SortIcon col="problema" /></span>
            </TableHead>
            <TableHead className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort('expiration')}>
              <span className="flex items-center">Expiração <SortIcon col="expiration" /></span>
            </TableHead>
            <TableHead className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedCompanies.map((company, index) => {
            const status = getStatusConfig(company);
            const isActive = company.is_active;
            const colorClass = AVATAR_COLORS[index % AVATAR_COLORS.length];

            return (
              <TableRow key={company.id} className="border-border/20 hover:bg-muted/20 transition-colors">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold ${colorClass}`}>
                      {getInitials(company.name)}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{company.name}</p>
                      {company.trade_name && (
                        <p className="text-xs text-muted-foreground">{company.trade_name}</p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] font-medium rounded-full px-2.5 py-0.5 ${isActive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-muted text-muted-foreground border-border'}`}>
                    {isActive ? 'Ativo' : 'Inativo'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">{company.email}</span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] font-medium rounded-full px-2.5 py-0.5 border ${status.className}`}>
                    {status.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  {(() => {
                    const ticket = getTicketStatus(company.id);
                    const Icon = ticket.icon;
                    return (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => {
                                if (ticket.label !== 'OK') {
                                  startImpersonation(company.id, company.name);
                                  router.push('/app/support');
                                }
                              }}
                              className={ticket.label !== 'OK' ? 'cursor-pointer hover:scale-105 transition-transform' : 'cursor-default'}
                            >
                              <Badge variant="outline" className={`text-[10px] font-medium rounded-full px-2.5 py-0.5 border ${ticket.className} flex items-center gap-1 w-fit`}>
                                <Icon className="h-3 w-3" />
                                {ticket.label}
                              </Badge>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {ticket.label === 'OK' ? 'Sem tickets abertos' : 'Clique para ver os tickets desta empresa'}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })()}
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {company.subscription_status === 'trial'
                      ? formatDate(company.trial_ends_at)
                      : formatDate(company.subscription_expires_at)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-xl text-muted-foreground hover:text-primary"
                      onClick={() => router.push(`/super-admin/companies/${company.id}`)}
                      title="Detalhes"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-xl text-muted-foreground hover:text-primary"
                      onClick={() => handleImpersonate(company)}
                      title="Acessar como empresa"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    {company.whatsapp_phone && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-xl text-muted-foreground hover:text-emerald-400"
                        onClick={() => window.open(`https://wa.me/${company.whatsapp_phone}`, '_blank')}
                        title="Abrir WhatsApp"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-xl text-muted-foreground hover:text-destructive"
                      onClick={() => setCompanyToDelete(company)}
                      title="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Footer with pagination */}
      <div className="px-6 py-3 border-t border-border/30 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Mostrando {paginatedCompanies.length} de {totalCount} empresas
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-xl text-xs text-muted-foreground"
            disabled={currentPage === 0}
            onClick={() => setCurrentPage(p => p - 1)}
          >
            Anterior
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-8 rounded-xl text-xs"
            disabled={currentPage >= totalPages - 1}
            onClick={() => setCurrentPage(p => p + 1)}
          >
            Próximo
          </Button>
        </div>
      </div>

      <AlertDialog open={!!companyToDelete} onOpenChange={() => setCompanyToDelete(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Empresa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a empresa <strong>{companyToDelete?.name}</strong>?
              <br /><br />
              Esta ação é irreversível e irá excluir todos os dados relacionados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Excluindo...' : 'Excluir Empresa'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

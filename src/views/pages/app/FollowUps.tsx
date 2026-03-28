import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useFollowUpJobs } from '@/hooks/useFollowUpJobs';
import { useAuth } from '@/hooks/useAuth';
import { useCompanies } from '@/hooks/useCompanies';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Clock,
  CheckCircle,
  XCircle,
  Ban,
  TrendingUp,
  Search,
  Calendar as CalendarIcon,
  MoreVertical,
  Eye,
  RefreshCw,
  Send,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatCards, type StatItem } from '@/components/ui/stat-cards';
import { TableSkeleton, CardListSkeleton } from '@/components/ui/table-skeleton';
import { EmptyState } from '@/components/ui/empty-state';

const statusConfig = {
  pending: { color: 'bg-amber-500', dot: 'bg-amber-500', label: 'Pendente', textColor: 'text-amber-700 dark:text-amber-400', bgLight: 'bg-amber-500/10' },
  sent: { color: 'bg-emerald-500', dot: 'bg-emerald-500', label: 'Enviado', textColor: 'text-emerald-700 dark:text-emerald-400', bgLight: 'bg-emerald-500/10' },
  failed: { color: 'bg-red-500', dot: 'bg-red-500', label: 'Falhou', textColor: 'text-red-700 dark:text-red-400', bgLight: 'bg-red-500/10' },
  cancelled: { color: 'bg-gray-500', dot: 'bg-gray-400', label: 'Cancelado', textColor: 'text-gray-700 dark:text-gray-400', bgLight: 'bg-gray-500/10' },
};

export default function FollowUps() {
  const { role } = useAuth();
  const isSuperAdmin = role === 'super_admin';

  const [statusFilter, setStatusFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [newScheduledDate, setNewScheduledDate] = useState('');

  const filters = {
    status: statusFilter !== 'all' ? statusFilter : undefined,
    companyId: companyFilter || undefined,
    clientSearch: clientSearch || undefined,
  };

  const { jobs, isLoading, stats, cancelJob, rescheduleJob } = useFollowUpJobs(filters);
  const { companies } = useCompanies();

  const selectedJobData = jobs?.find(j => j.id === selectedJob);

  const statItems: StatItem[] = [
    { label: 'Pendentes', value: stats.pending, icon: Clock, color: 'yellow' },
    { label: 'Enviados', value: stats.sent, icon: CheckCircle, color: 'green' },
    { label: 'Falhados', value: stats.failed, icon: XCircle, color: 'red' },
    { label: 'Taxa de Sucesso', value: `${stats.successRate}%`, icon: TrendingUp, color: 'cyan' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Follow-ups</h1>
        <p className="text-muted-foreground">
          Gerencie todos os jobs de follow-up automáticos
        </p>
      </div>

      {/* Stat Cards */}
      <StatCards items={statItems} loading={isLoading} />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente ou telefone..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex gap-1">
          {[
            { key: 'all', label: 'Todos' },
            { key: 'pending', label: 'Pendentes' },
            { key: 'sent', label: 'Enviados' },
            { key: 'failed', label: 'Falhados' },
          ].map(({ key, label }) => (
            <Button
              key={key}
              variant={statusFilter === key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(key)}
              className="text-xs"
            >
              {label}
            </Button>
          ))}
        </div>

        {isSuperAdmin && (
          <Select value={companyFilter || "all"} onValueChange={(v) => setCompanyFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Todas as empresas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {companies?.map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Table / Content */}
      <div className="hidden md:block">
        {isLoading ? (
          <TableSkeleton
            columns={isSuperAdmin ? 7 : 6}
            rows={8}
            headers={[
              'Cliente',
              ...(isSuperAdmin ? ['Empresa'] : []),
              'Etapa',
              'Agendado Para',
              'Status',
              'Tentativas',
              'Ações',
            ]}
          />
        ) : !jobs || jobs.length === 0 ? (
          <EmptyState
            icon={Send}
            title={statusFilter !== 'all' || clientSearch ? 'Nenhum resultado encontrado' : 'Nenhum follow-up'}
            description={
              statusFilter !== 'all' || clientSearch
                ? 'Tente ajustar os filtros ou o termo de busca.'
                : 'Os jobs de follow-up aparecerão aqui quando forem criados automaticamente.'
            }
          />
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  {isSuperAdmin && <TableHead>Empresa</TableHead>}
                  <TableHead>Etapa</TableHead>
                  <TableHead>Agendado Para</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tentativas</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => {
                  const sc = statusConfig[job.status];
                  return (
                    <TableRow key={job.id} className="group">
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {job.client?.first_name} {job.client?.last_name || ''}
                          </span>
                          <span className="text-xs text-muted-foreground">{job.client?.phone}</span>
                        </div>
                      </TableCell>
                      {isSuperAdmin && (
                        <TableCell className="text-sm text-muted-foreground">{job.company?.name}</TableCell>
                      )}
                      <TableCell>
                        <Badge variant="outline" className="text-xs">Follow-up {job.stage_order}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm">
                            {format(new Date(job.scheduled_for), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${sc.bgLight} ${sc.textColor}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                          {sc.label}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 3 }).map((_, i) => (
                            <span
                              key={i}
                              className={`h-1.5 w-4 rounded-full ${i < job.attempts ? sc.color : 'bg-muted'}`}
                            />
                          ))}
                          <span className="text-xs text-muted-foreground ml-1">{job.attempts}/3</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setSelectedJob(job.id); setDetailsOpen(true); }}>
                              <Eye className="h-4 w-4 mr-2" />
                              Ver Detalhes
                            </DropdownMenuItem>
                            {job.status === 'pending' && (
                              <>
                                <DropdownMenuItem onClick={() => { setSelectedJob(job.id); setNewScheduledDate(format(new Date(job.scheduled_for), "yyyy-MM-dd'T'HH:mm")); setRescheduleDialogOpen(true); }}>
                                  <RefreshCw className="h-4 w-4 mr-2" />
                                  Reagendar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setSelectedJob(job.id); setCancelDialogOpen(true); }} className="text-destructive">
                                  <Ban className="h-4 w-4 mr-2" />
                                  Cancelar
                                </DropdownMenuItem>
                              </>
                            )}
                            {job.status === 'failed' && (
                              <DropdownMenuItem onClick={() => { setSelectedJob(job.id); setNewScheduledDate(format(new Date(), "yyyy-MM-dd'T'HH:mm")); setRescheduleDialogOpen(true); }}>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Reprocessar
                              </DropdownMenuItem>
                            )}
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
        ) : !jobs || jobs.length === 0 ? (
          <EmptyState
            icon={Send}
            title="Nenhum follow-up"
            description="Os jobs aparecerão aqui automaticamente."
          />
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => {
              const sc = statusConfig[job.status];
              return (
                <Card key={job.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {job.client?.first_name} {job.client?.last_name || ''}
                        </p>
                        <p className="text-xs text-muted-foreground">{job.client?.phone}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${sc.bgLight} ${sc.textColor}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                          {sc.label}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setSelectedJob(job.id); setDetailsOpen(true); }}>
                              <Eye className="h-4 w-4 mr-2" /> Ver Detalhes
                            </DropdownMenuItem>
                            {job.status === 'pending' && (
                              <>
                                <DropdownMenuItem onClick={() => { setSelectedJob(job.id); setNewScheduledDate(format(new Date(job.scheduled_for), "yyyy-MM-dd'T'HH:mm")); setRescheduleDialogOpen(true); }}>
                                  <RefreshCw className="h-4 w-4 mr-2" /> Reagendar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setSelectedJob(job.id); setCancelDialogOpen(true); }} className="text-destructive">
                                  <Ban className="h-4 w-4 mr-2" /> Cancelar
                                </DropdownMenuItem>
                              </>
                            )}
                            {job.status === 'failed' && (
                              <DropdownMenuItem onClick={() => { setSelectedJob(job.id); setNewScheduledDate(format(new Date(), "yyyy-MM-dd'T'HH:mm")); setRescheduleDialogOpen(true); }}>
                                <RefreshCw className="h-4 w-4 mr-2" /> Reprocessar
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <Badge variant="outline" className="text-xs">Follow-up {job.stage_order}</Badge>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <span key={i} className={`h-1.5 w-3 rounded-full ${i < job.attempts ? sc.color : 'bg-muted'}`} />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {format(new Date(job.scheduled_for), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Job</DialogTitle>
            <DialogDescription>Informações completas sobre o job de follow-up</DialogDescription>
          </DialogHeader>
          {selectedJobData && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Cliente</h4>
                  <p className="text-sm font-semibold">
                    {selectedJobData.client?.first_name} {selectedJobData.client?.last_name || ''}
                  </p>
                  <p className="text-xs text-muted-foreground">{selectedJobData.client?.phone}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Etapa</h4>
                  <p className="text-sm font-semibold">Follow-up {selectedJobData.stage_order}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Status</h4>
                  <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig[selectedJobData.status].bgLight} ${statusConfig[selectedJobData.status].textColor}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${statusConfig[selectedJobData.status].dot}`} />
                    {statusConfig[selectedJobData.status].label}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Tentativas</h4>
                  <p className="text-sm font-semibold">{selectedJobData.attempts}/3</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Agendado Para</h4>
                  <p className="text-sm">{format(new Date(selectedJobData.scheduled_for), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Criado em</h4>
                  <p className="text-sm">{format(new Date(selectedJobData.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Mensagem</h4>
                <div className="bg-muted p-3 rounded-lg">
                  <p className="text-sm whitespace-pre-wrap">{selectedJobData.message_text}</p>
                </div>
              </div>

              {selectedJobData.error_message && (
                <div>
                  <h4 className="text-sm font-medium text-destructive mb-2">Erro</h4>
                  <div className="bg-destructive/10 p-3 rounded-lg border border-destructive/20">
                    <p className="text-sm text-destructive">{selectedJobData.error_message}</p>
                  </div>
                </div>
              )}

              {selectedJobData.last_attempt_at && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Última Tentativa</h4>
                  <p className="text-sm">{format(new Date(selectedJobData.last_attempt_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Job de Follow-up</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar este job? Esta ação não pode ser desfeita e a mensagem
              não será enviada ao cliente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (selectedJob) { cancelJob(selectedJob); setCancelDialogOpen(false); } }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Sim, cancelar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reschedule Dialog */}
      <Dialog open={rescheduleDialogOpen} onOpenChange={setRescheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reagendar Job</DialogTitle>
            <DialogDescription>Escolha uma nova data e horário para este follow-up</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nova Data e Horário</label>
              <Input
                type="datetime-local"
                value={newScheduledDate}
                onChange={(e) => setNewScheduledDate(e.target.value)}
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (selectedJob && newScheduledDate) {
                  rescheduleJob({ jobId: selectedJob, newDate: new Date(newScheduledDate).toISOString() });
                  setRescheduleDialogOpen(false);
                }
              }}
            >
              Reagendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

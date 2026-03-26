import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const statusColors = {
  pending: 'bg-yellow-500',
  sent: 'bg-green-500',
  failed: 'bg-red-500',
  cancelled: 'bg-gray-500',
};

const statusLabels = {
  pending: 'Pendente',
  sent: 'Enviado',
  failed: 'Falhou',
  cancelled: 'Cancelado',
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Follow-ups</h1>
        <p className="text-muted-foreground">
          Gerencie todos os jobs de follow-up automáticos
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{stats.pending}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Enviados</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{stats.sent}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Falhados</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{stats.failed}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cancelados</CardTitle>
            <Ban className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{stats.cancelled}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Sucesso</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{stats.successRate}%</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
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

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="sent">Enviados</SelectItem>
                <SelectItem value="failed">Falhados</SelectItem>
                <SelectItem value="cancelled">Cancelados</SelectItem>
              </SelectContent>
            </Select>

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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Jobs de Follow-up</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : jobs && jobs.length > 0 ? (
            <>
              {/* Desktop table */}
              <div className="hidden md:block border rounded-lg">
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
                    {jobs.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {job.client?.first_name} {job.client?.last_name || ''}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {job.client?.phone}
                            </span>
                          </div>
                        </TableCell>
                        {isSuperAdmin && (
                          <TableCell>
                            <span className="text-sm">{job.company?.name}</span>
                          </TableCell>
                        )}
                        <TableCell>
                          <Badge variant="outline">Follow-up {job.stage_order}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                              {format(new Date(job.scheduled_for), "dd/MM/yyyy 'às' HH:mm", {
                                locale: ptBR,
                              })}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`${statusColors[job.status]} text-white border-0`}
                          >
                            {statusLabels[job.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{job.attempts}/3</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedJob(job.id);
                                  setDetailsOpen(true);
                                }}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                Ver Detalhes
                              </DropdownMenuItem>
                              {job.status === 'pending' && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedJob(job.id);
                                      setNewScheduledDate(
                                        format(new Date(job.scheduled_for), "yyyy-MM-dd'T'HH:mm")
                                      );
                                      setRescheduleDialogOpen(true);
                                    }}
                                  >
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                    Reagendar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedJob(job.id);
                                      setCancelDialogOpen(true);
                                    }}
                                    className="text-destructive"
                                  >
                                    <Ban className="h-4 w-4 mr-2" />
                                    Cancelar
                                  </DropdownMenuItem>
                                </>
                              )}
                              {job.status === 'failed' && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedJob(job.id);
                                    setNewScheduledDate(
                                      format(new Date(), "yyyy-MM-dd'T'HH:mm")
                                    );
                                    setRescheduleDialogOpen(true);
                                  }}
                                >
                                  <RefreshCw className="h-4 w-4 mr-2" />
                                  Reprocessar
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {jobs.map((job) => (
                  <div key={job.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {job.client?.first_name} {job.client?.last_name || ''}
                        </p>
                        <p className="text-xs text-muted-foreground">{job.client?.phone}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge
                          variant="outline"
                          className={`${statusColors[job.status]} text-white border-0 text-[10px]`}
                        >
                          {statusLabels[job.status]}
                        </Badge>
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
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant="outline" className="text-xs">Follow-up {job.stage_order}</Badge>
                      <span className="text-xs text-muted-foreground">{job.attempts}/3 tentativas</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {format(new Date(job.scheduled_for), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Clock className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum job encontrado</h3>
              <p className="text-muted-foreground">
                {statusFilter !== 'all'
                  ? `Não há jobs com status "${statusLabels[statusFilter as keyof typeof statusLabels]}"`
                  : 'Nenhum job de follow-up foi criado ainda'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Job</DialogTitle>
            <DialogDescription>
              Informações completas sobre o job de follow-up
            </DialogDescription>
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
                  <Badge
                    variant="outline"
                    className={`${statusColors[selectedJobData.status]} text-white border-0`}
                  >
                    {statusLabels[selectedJobData.status]}
                  </Badge>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Tentativas</h4>
                  <p className="text-sm font-semibold">{selectedJobData.attempts}/3</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Agendado Para</h4>
                  <p className="text-sm">
                    {format(new Date(selectedJobData.scheduled_for), "dd/MM/yyyy 'às' HH:mm", {
                      locale: ptBR,
                    })}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Criado em</h4>
                  <p className="text-sm">
                    {format(new Date(selectedJobData.created_at), "dd/MM/yyyy 'às' HH:mm", {
                      locale: ptBR,
                    })}
                  </p>
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
                  <p className="text-sm">
                    {format(new Date(selectedJobData.last_attempt_at), "dd/MM/yyyy 'às' HH:mm", {
                      locale: ptBR,
                    })}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

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
              onClick={() => {
                if (selectedJob) {
                  cancelJob(selectedJob);
                  setCancelDialogOpen(false);
                }
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Sim, cancelar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={rescheduleDialogOpen} onOpenChange={setRescheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reagendar Job</DialogTitle>
            <DialogDescription>
              Escolha uma nova data e horário para este follow-up
            </DialogDescription>
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
                  rescheduleJob({
                    jobId: selectedJob,
                    newDate: new Date(newScheduledDate).toISOString(),
                  });
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

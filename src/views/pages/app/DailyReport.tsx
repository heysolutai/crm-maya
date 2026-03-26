import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useDailyReport } from '@/hooks/useDailyReport';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { 
  FileText, Send, Users, CalendarDays, CalendarCheck, 
  TrendingUp, Clock, Loader2, UserCheck, ShoppingBag, DollarSign, UserPlus,
} from 'lucide-react';
import { MetricDetailDialog, type MetricType } from '@/components/daily-report/MetricDetailDialog';

export default function DailyReport() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [dialogType, setDialogType] = useState<MetricType | null>(null);
  const queryClient = useQueryClient();

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['crm-entries-today'] });
    queryClient.invalidateQueries({ queryKey: ['crm-scheduled-today'] });
    queryClient.invalidateQueries({ queryKey: ['crm-scheduled-for-today'] });
    queryClient.invalidateQueries({ queryKey: ['today-appointments'] });
    queryClient.invalidateQueries({ queryKey: ['appointments-today-list'] });
    queryClient.invalidateQueries({ queryKey: ['sales-today'] });
  };

  const {
    crmEntries, crmEntriesData, crmScheduled, crmScheduledData,
    crmScheduledToday, crmScheduledTodayData,
    todayAppointments, todaySales, salesTotalAmount,
    existingReport, reportHistory,
    generateReport, isGenerating,
  } = useDailyReport(selectedDate);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const dateFormatted = format(selectedDate, "dd/MM/yyyy", { locale: ptBR });

  const attendedCount = todayAppointments.filter((apt: any) => apt.status === 'completed' && apt.notes !== 'walk-in').length;
  const walkInCount = todayAppointments.filter((apt: any) => apt.status === 'completed' && apt.notes === 'walk-in').length;

  const getReportText = () => {
    return `📊 RELATÓRIO DO DIA - ${dateFormatted}

📥 ENTRANTES: ${crmEntries}
📅 AGENDARAM HOJE: ${crmScheduled}
📋 AGENDADOS PRA HOJE: ${crmScheduledToday}
✅ COMPARECERAM: ${attendedCount}
🚶 SEM AGENDAR: ${walkInCount}
🛒 VENDAS: ${todaySales.length}
💵 TOTAL EM VENDAS: ${formatCurrency(salesTotalAmount)}`;
  };

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(getReportText());
      toast.success('Relatório copiado!');
    } catch {
      toast.error('Erro ao copiar relatório');
    }
  };

  const openDialog = (type: MetricType) => setDialogType(type);

  const getDialogProps = () => {
    const base = { scheduledForToday: crmScheduledTodayData };
    switch (dialogType) {
      case 'entrantes':
        return { ...base, clients: crmEntriesData };
      case 'agendaram':
        return { ...base, appointments: crmScheduledData };
      case 'agendados':
        return { ...base, appointments: crmScheduledTodayData };
      case 'compareceram':
        return { ...base, appointments: todayAppointments };
      case 'walk_in':
        return { ...base, appointments: todayAppointments };
      case 'vendas':
      case 'total_vendas':
        return { ...base, sales: todaySales };
      default:
        return base;
    }
  };

  const metricCards = [
    { type: 'entrantes' as MetricType, icon: Users, value: crmEntries, label: 'Entrantes' },
    { type: 'agendaram' as MetricType, icon: CalendarDays, value: crmScheduled, label: 'Agenda hoje' },
    { type: 'agendados' as MetricType, icon: CalendarCheck, value: crmScheduledToday, label: 'Agendados p/ Hoje' },
    { type: 'compareceram' as MetricType, icon: UserCheck, value: attendedCount, label: 'Compareceram' },
    { type: 'walk_in' as MetricType, icon: UserPlus, value: walkInCount, label: 'Sem Agendar' },
    { type: 'vendas' as MetricType, icon: ShoppingBag, value: todaySales.length, label: 'Vendas' },
    { type: 'total_vendas' as MetricType, icon: DollarSign, value: formatCurrency(salesTotalAmount), label: 'Total em Vendas' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <FileText className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
            Relatório Diário
          </h1>
          <p className="text-sm text-muted-foreground">
            Gere e envie o relatório do dia {dateFormatted} para o grupo do WhatsApp
          </p>
        </div>
        <Popover modal>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full sm:w-auto justify-start text-left font-normal gap-2">
              <CalendarDays className="h-4 w-4" />
              {dateFormatted}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 z-50" align="start" sideOffset={8}>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* CRM Auto Data */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-5 w-5 text-primary" />
            Dados CRM (Automático)
          </CardTitle>
          <CardDescription>Clique em um card para ver os detalhes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 sm:gap-4">
            {metricCards.map(({ type, icon: Icon, value, label }) => (
              <button
                key={type}
                onClick={() => openDialog(type)}
                className="flex flex-col items-center p-4 rounded-lg bg-muted/50 hover:bg-muted hover:ring-2 hover:ring-primary/20 transition-all cursor-pointer text-center"
              >
                <Icon className="h-5 w-5 text-primary mb-1" />
                <span className="text-2xl font-bold">{value}</span>
                <span className="text-xs text-muted-foreground">{label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      {dialogType && (
        <MetricDetailDialog
          open={!!dialogType}
          onOpenChange={(open) => !open && setDialogType(null)}
          type={dialogType}
          {...getDialogProps()}
          onRefresh={handleRefresh}
        />
      )}

      {/* Preview + Send */}
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-5 w-5 text-primary" />
            Preview do Relatório
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap">
            {getReportText()}
          </div>

          <div className="flex items-center gap-3">
            <Button 
              onClick={async () => {
                await handleCopyReport();
                generateReport.mutate();
              }} 
              disabled={isGenerating}
              className="flex-1"
              size="lg"
            >
              {isGenerating ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Gerando...</>
              ) : (
                <><Send className="mr-2 h-4 w-4" />Gerar e Copiar Relatório</>
              )}
            </Button>
            {existingReport?.sent_at && (
              <Badge variant="secondary" className="whitespace-nowrap">
                Enviado às {format(new Date(existingReport.sent_at), 'HH:mm')}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* History */}
      {reportHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-5 w-5 text-primary" />
              Histórico de Relatórios
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Entrantes</TableHead>
                  <TableHead>Agendaram</TableHead>
                  <TableHead>Agendados Hoje</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportHistory.map((report: any) => (
                  <TableRow key={report.id}>
                    <TableCell>{format(new Date(report.report_date + 'T12:00:00'), 'dd/MM/yyyy')}</TableCell>
                    <TableCell>{report.crm_entries}</TableCell>
                    <TableCell>{report.crm_scheduled}</TableCell>
                    <TableCell>{report.crm_scheduled_today}</TableCell>
                    <TableCell>
                      {report.sent_at ? (
                        <Badge variant="default" className="text-xs">Enviado</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">Salvo</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

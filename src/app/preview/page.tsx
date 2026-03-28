'use client'

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  LayoutDashboard, Kanban, Users, MessageSquare, Calendar, UserCog,
  Settings, Package, Clock, FileText, Bot, LifeBuoy, BookOpen, Code,
  Building2, ChevronsUpDown, ChevronRight, Search, Plus, Pencil, Trash2,
  UserPlus, ContactRound, DollarSign, UserCheck, Wrench, TrendingUp,
  PackageCheck, Shield, Crown, User, Eye, UserX, Send, CheckCircle,
  XCircle, Layers, X, Menu, Plug,
} from 'lucide-react';
import { StatCards, type StatItem } from '@/components/ui/stat-cards';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ThemeToggle';

// ── Mock Data ──────────────────────────────────────────────

const mockClients = [
  { id: '1', first_name: 'Ana', last_name: 'Silva', email: 'ana@email.com', phone: '(11) 99999-1234', document_number: '123.456.789-00', is_active: true, created_at: '2026-03-15T10:00:00Z' },
  { id: '2', first_name: 'Carlos', last_name: 'Oliveira', email: 'carlos@empresa.com', phone: '(21) 98888-5678', document_number: '987.654.321-00', is_active: true, created_at: '2026-03-10T08:00:00Z' },
  { id: '3', first_name: 'Maria', last_name: 'Santos', email: 'maria@gmail.com', phone: '(31) 97777-9012', document_number: '', is_active: false, created_at: '2026-02-20T14:00:00Z' },
  { id: '4', first_name: 'Pedro', last_name: 'Costa', email: 'pedro@hotmail.com', phone: '(41) 96666-3456', document_number: '111.222.333-44', is_active: true, created_at: '2026-03-25T16:00:00Z' },
  { id: '5', first_name: 'Julia', last_name: 'Ferreira', email: 'julia@outlook.com', phone: '(51) 95555-7890', document_number: '', is_active: true, created_at: '2026-03-20T09:00:00Z' },
  { id: '6', first_name: 'Lucas', last_name: 'Mendes', email: 'lucas@tech.io', phone: '(61) 94444-2345', document_number: '555.666.777-88', is_active: true, created_at: '2026-01-05T11:00:00Z' },
];

const mockProducts = [
  { id: '1', name: 'Lente Multifocal Premium', sku: 'LMP-001', category: 'Lentes', price: 890, cost: 340, is_service: false, is_active: true },
  { id: '2', name: 'Armação Ray-Ban Aviator', sku: 'ARB-012', category: 'Armações', price: 650, cost: 280, is_service: false, is_active: true },
  { id: '3', name: 'Consulta Oftalmológica', sku: 'SRV-001', category: 'Consultas', price: 250, cost: 0, is_service: true, is_active: true },
  { id: '4', name: 'Lente de Contato Acuvue', sku: 'LCA-003', category: 'Lentes', price: 180, cost: 75, is_service: false, is_active: true },
  { id: '5', name: 'Ajuste de Armação', sku: 'SRV-002', category: 'Serviços', price: 50, cost: 0, is_service: true, is_active: false },
];

const mockTeam = [
  { id: '1', full_name: 'Roberto Admin', email: 'roberto@mileto.com', role: 'company_admin', is_active: true, last_seen_at: '2026-03-28T10:30:00Z' },
  { id: '2', full_name: 'Fernanda Gerente', email: 'fernanda@mileto.com', role: 'manager', is_active: true, last_seen_at: '2026-03-28T09:15:00Z' },
  { id: '3', full_name: 'Diego Agente', email: 'diego@mileto.com', role: 'agent', is_active: true, last_seen_at: '2026-03-27T18:00:00Z' },
  { id: '4', full_name: 'Camila Agente', email: 'camila@mileto.com', role: 'agent', is_active: true, last_seen_at: null },
  { id: '5', full_name: 'Bruno Viewer', email: 'bruno@mileto.com', role: 'viewer', is_active: false, last_seen_at: '2026-03-20T12:00:00Z' },
];

const mockFollowUps = [
  { id: '1', client_name: 'Ana Silva', phone: '(11) 99999-1234', stage_order: 1, scheduled_for: '2026-03-28T14:00:00Z', status: 'pending' as const, attempts: 0 },
  { id: '2', client_name: 'Carlos Oliveira', phone: '(21) 98888-5678', stage_order: 2, scheduled_for: '2026-03-28T10:00:00Z', status: 'sent' as const, attempts: 1 },
  { id: '3', client_name: 'Maria Santos', phone: '(31) 97777-9012', stage_order: 1, scheduled_for: '2026-03-27T16:00:00Z', status: 'failed' as const, attempts: 3 },
  { id: '4', client_name: 'Pedro Costa', phone: '(41) 96666-3456', stage_order: 3, scheduled_for: '2026-03-26T09:00:00Z', status: 'sent' as const, attempts: 1 },
  { id: '5', client_name: 'Julia Ferreira', phone: '(51) 95555-7890', stage_order: 1, scheduled_for: '2026-03-25T11:00:00Z', status: 'cancelled' as const, attempts: 0 },
];

const mockDepartments = [
  { id: '1', name: 'Vendas', description: 'Equipe de vendas e prospecção', color: '#10b981', members: ['Roberto Admin', 'Diego Agente', 'Camila Agente'] },
  { id: '2', name: 'Suporte', description: 'Atendimento e pós-venda', color: '#3b82f6', members: ['Fernanda Gerente', 'Diego Agente'] },
  { id: '3', name: 'Financeiro', description: 'Cobranças e pagamentos', color: '#f59e0b', members: [] },
];

// ── Helpers ──────────────────────────────────────────────

const avatarColors = ['bg-emerald-500', 'bg-blue-500', 'bg-purple-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-pink-500'];

function getInitials(first: string, last?: string) {
  return ((first?.[0] || '') + (last?.[0] || '')).toUpperCase() || '??';
}

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

const roleLabels: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  company_admin: { label: 'Administrador', icon: Crown, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-500/10' },
  manager: { label: 'Gerente', icon: Shield, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' },
  agent: { label: 'Agente', icon: User, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
  viewer: { label: 'Visualizador', icon: Eye, color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-500/10' },
};

const statusConfig: Record<string, { dot: string; label: string; textColor: string; bgLight: string; color: string }> = {
  pending: { color: 'bg-amber-500', dot: 'bg-amber-500', label: 'Pendente', textColor: 'text-amber-700 dark:text-amber-400', bgLight: 'bg-amber-500/10' },
  sent: { color: 'bg-emerald-500', dot: 'bg-emerald-500', label: 'Enviado', textColor: 'text-emerald-700 dark:text-emerald-400', bgLight: 'bg-emerald-500/10' },
  failed: { color: 'bg-red-500', dot: 'bg-red-500', label: 'Falhou', textColor: 'text-red-700 dark:text-red-400', bgLight: 'bg-red-500/10' },
  cancelled: { color: 'bg-gray-500', dot: 'bg-gray-400', label: 'Cancelado', textColor: 'text-gray-700 dark:text-gray-400', bgLight: 'bg-gray-500/10' },
};

// ── Nav config ──────────────────────────────────────────

const navGroups = [
  {
    label: 'Principal',
    items: [
      { name: 'Dashboard', icon: LayoutDashboard, active: false, count: 0 },
      { name: 'Conversas', icon: MessageSquare, active: false, count: 12 },
      { name: 'CRM', icon: Kanban, active: false, count: 0 },
    ],
  },
  {
    label: 'Vendas',
    items: [
      { name: 'Clientes', icon: Users, active: false, count: 0 },
      { name: 'Produtos', icon: Package, active: false, count: 0 },
      { name: 'Agenda', icon: Calendar, active: false, count: 3 },
      { name: 'Follow-ups', icon: Clock, active: false, count: 5 },
    ],
  },
  {
    label: 'Relatórios',
    items: [
      { name: 'Relatório', icon: FileText, active: false, count: 0 },
    ],
  },
  {
    label: 'Administração',
    items: [
      { name: 'Equipe', icon: UserCog, active: false, count: 0 },
      { name: 'Departamentos', icon: Building2, active: false, count: 0 },
      { name: 'IA', icon: Bot, active: false, count: 0 },
      { name: 'Prompts', icon: BookOpen, active: false, count: 0 },
      { name: 'API Docs', icon: Code, active: false, count: 0 },
      { name: 'Configurações', icon: Settings, active: false, count: 0 },
      { name: 'Suporte', icon: LifeBuoy, active: false, count: 0 },
    ],
  },
];

// ── Page Sections ──────────────────────────────────────

type PageKey = 'dashboard' | 'conversas' | 'crm' | 'clientes' | 'produtos' | 'agenda' | 'followups' | 'relatorio' | 'equipe' | 'departamentos' | 'configuracoes';

const pages: { key: PageKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'conversas', label: 'Conversas' },
  { key: 'crm', label: 'CRM' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'produtos', label: 'Produtos' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'followups', label: 'Follow-ups' },
  { key: 'relatorio', label: 'Relatório' },
  { key: 'equipe', label: 'Equipe' },
  { key: 'departamentos', label: 'Departamentos' },
  { key: 'configuracoes', label: 'Configurações' },
];

// ── Main Preview ──────────────────────────────────────

export default function PreviewPage() {
  const [activePage, setActivePage] = useState<PageKey>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const activeNavName = pages.find(p => p.key === activePage)?.label || 'Clientes';
  const breadcrumbGroup = navGroups.find(g => g.items.some(i => i.name === activeNavName))?.label || 'Vendas';

  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* ── SIDEBAR ── */}
        <aside className={cn(
          'border-r border-sidebar-border bg-sidebar flex flex-col',
          'fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}>
          {/* Company Header */}
          <div className="px-3">
            <div className="flex items-center gap-3 px-1 py-4">
              <div className="relative shrink-0">
                <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">M</div>
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-sidebar bg-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-sidebar-foreground truncate">Ótica Exemplo</p>
                <p className="text-[11px] text-sidebar-foreground/50 truncate">WhatsApp conectado</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-sidebar-foreground md:hidden" onClick={() => setSidebarOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Separator className="bg-sidebar-border" />

          {/* Navigation */}
          <ScrollArea className="flex-1 py-3">
            <TooltipProvider delayDuration={0}>
              {navGroups.map((group, groupIndex) => (
                <div key={group.label} className={cn(groupIndex > 0 && 'mt-4')}>
                  <p className="px-4 mb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                    {group.label}
                  </p>
                  <nav className="space-y-0.5 px-2">
                    {group.items.map((item) => {
                      const isActive = item.name === activeNavName;
                      const pageKey = pages.find(p => p.label === item.name)?.key;
                      return (
                        <Tooltip key={item.name}>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => {
                                if (pageKey) { setActivePage(pageKey); setSidebarOpen(false); }
                              }}
                              className={cn(
                                'group/nav flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                                isActive
                                  ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                                !pageKey && 'opacity-50 cursor-default'
                              )}
                            >
                              <item.icon className={cn(
                                'h-4 w-4 shrink-0 transition-colors',
                                isActive ? 'text-sidebar-primary-foreground' : 'text-sidebar-foreground/50 group-hover/nav:text-sidebar-accent-foreground'
                              )} />
                              <span className="flex-1 truncate text-left">{item.name}</span>
                              {item.count > 0 && (
                                <span className={cn(
                                  'ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums',
                                  isActive
                                    ? 'bg-sidebar-primary-foreground/20 text-sidebar-primary-foreground'
                                    : item.name === 'Conversas'
                                      ? 'bg-destructive text-destructive-foreground'
                                      : 'bg-sidebar-foreground/10 text-sidebar-foreground/70'
                                )}>
                                  {item.count}
                                </span>
                              )}
                            </button>
                          </TooltipTrigger>
                          {item.count > 0 && (
                            <TooltipContent side="right" className="text-xs">
                              {item.name === 'Conversas' && `${item.count} conversa(s) não lida(s)`}
                              {item.name === 'Agenda' && `${item.count} agendamento(s) hoje`}
                              {item.name === 'Follow-ups' && `${item.count} follow-up(s) pendente(s)`}
                            </TooltipContent>
                          )}
                        </Tooltip>
                      );
                    })}
                  </nav>
                </div>
              ))}
            </TooltipProvider>
          </ScrollArea>

          <Separator className="bg-sidebar-border" />

          {/* Footer */}
          <div className="p-2">
            <div className="flex items-center gap-1 px-1 mb-2">
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent">
                      <Settings className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">Configurações</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent">
                      <LifeBuoy className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">Suporte</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div className="flex-1" />
              <ThemeToggle />
            </div>

            <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-sidebar-accent cursor-pointer">
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarFallback className="text-xs font-semibold bg-sidebar-primary text-sidebar-primary-foreground">RA</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-sidebar-foreground truncate">Roberto Admin</p>
                <p className="text-[11px] text-sidebar-foreground/50 truncate">Administrador</p>
              </div>
              <ChevronsUpDown className="h-4 w-4 text-sidebar-foreground/30 shrink-0" />
            </button>
          </div>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <header className="flex h-14 items-center gap-3 border-b border-border px-4 shrink-0">
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 md:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs text-muted-foreground hidden sm:inline">{breadcrumbGroup}</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 hidden sm:block" />
              <h1 className="text-lg font-semibold truncate">{activeNavName}</h1>
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-2 px-2 py-1 h-8">
              <span className="relative flex h-2.5 w-2.5">
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              <span className="hidden sm:inline text-xs font-medium text-foreground">WhatsApp</span>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            {activePage === 'dashboard' && <DashboardPreview />}
            {activePage === 'conversas' && <ConversasPreview />}
            {activePage === 'crm' && <CRMPreview />}
            {activePage === 'clientes' && <ClientsPreview />}
            {activePage === 'produtos' && <ProductsPreview />}
            {activePage === 'agenda' && <AgendaPreview />}
            {activePage === 'followups' && <FollowUpsPreview />}
            {activePage === 'relatorio' && <RelatorioPreview />}
            {activePage === 'equipe' && <TeamPreview />}
            {activePage === 'departamentos' && <DepartmentsPreview />}
            {activePage === 'configuracoes' && <ConfiguracoesPreview />}
          </main>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard Preview ──────────────────────────────────

const mockDailyData = [
  { day: 'Seg', leads: 12, conversas: 18, vendas: 3 },
  { day: 'Ter', leads: 15, conversas: 22, vendas: 5 },
  { day: 'Qua', leads: 8, conversas: 14, vendas: 2 },
  { day: 'Qui', leads: 20, conversas: 28, vendas: 7 },
  { day: 'Sex', leads: 18, conversas: 25, vendas: 6 },
  { day: 'Sáb', leads: 6, conversas: 10, vendas: 1 },
  { day: 'Dom', leads: 3, conversas: 5, vendas: 0 },
];

const mockFunnelData = [
  { name: 'Novo Lead', value: 48, color: 'hsl(173, 80%, 40%)' },
  { name: 'Qualificado', value: 32, color: 'hsl(210, 70%, 50%)' },
  { name: 'Proposta', value: 18, color: 'hsl(250, 60%, 60%)' },
  { name: 'Negociação', value: 12, color: 'hsl(290, 50%, 50%)' },
  { name: 'Fechado', value: 8, color: 'hsl(150, 60%, 45%)' },
];

function DashboardPreview() {
  const dashStats: StatItem[] = [
    { label: 'Novos Leads', value: 82, icon: UserPlus, color: 'blue', subtitle: '+12.5% vs semana anterior' },
    { label: 'Conversas Ativas', value: 124, icon: MessageSquare, color: 'green', subtitle: '18 não lidas' },
    { label: 'Agendamentos Hoje', value: 7, icon: Calendar, color: 'purple' },
    { label: 'Receita (30d)', value: 'R$ 47.8k', icon: DollarSign, color: 'cyan', subtitle: '+8.3% vs mês anterior' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral do seu negócio</p>
      </div>

      <StatCards items={dashStats} />

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bar chart - Atividade Semanal */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Atividade Semanal</CardTitle>
            <CardDescription className="text-xs">Leads, conversas e vendas dos últimos 7 dias</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {mockDailyData.map((d) => (
                <div key={d.day} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-8">{d.day}</span>
                  <div className="flex-1 flex gap-1 h-5">
                    <div className="bg-blue-500 rounded-sm h-full transition-all" style={{ width: `${(d.leads / 30) * 100}%` }} />
                    <div className="bg-emerald-500 rounded-sm h-full transition-all" style={{ width: `${(d.conversas / 30) * 100}%` }} />
                    <div className="bg-purple-500 rounded-sm h-full transition-all" style={{ width: `${(d.vendas / 30) * 100}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-12 text-right">{d.leads + d.conversas + d.vendas}</span>
                </div>
              ))}
              <div className="flex items-center gap-4 pt-2 justify-center">
                <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-500" /><span className="text-xs text-muted-foreground">Leads</span></div>
                <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /><span className="text-xs text-muted-foreground">Conversas</span></div>
                <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-purple-500" /><span className="text-xs text-muted-foreground">Vendas</span></div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Funnel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Funil de Vendas</CardTitle>
            <CardDescription className="text-xs">Distribuição de leads por etapa</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {mockFunnelData.map((stage, i) => (
                <div key={stage.name} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{stage.name}</span>
                    <span className="font-semibold">{stage.value}</span>
                  </div>
                  <div className="h-7 rounded-md overflow-hidden bg-muted">
                    <div
                      className="h-full rounded-md transition-all flex items-center pl-2"
                      style={{ width: `${(stage.value / 48) * 100}%`, backgroundColor: stage.color }}
                    >
                      <span className="text-[10px] font-bold text-white">{((stage.value / 48) * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Atividade Recente</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { icon: MessageSquare, text: 'Nova conversa iniciada por Ana Silva', time: 'há 5 min', color: 'text-blue-500' },
              { icon: Calendar, text: 'Agendamento confirmado — Carlos Oliveira', time: 'há 12 min', color: 'text-purple-500' },
              { icon: DollarSign, text: 'Venda fechada — R$ 1.250,00 (Lente Premium)', time: 'há 28 min', color: 'text-emerald-500' },
              { icon: UserPlus, text: 'Novo lead via WhatsApp — Julia Ferreira', time: 'há 45 min', color: 'text-cyan-500' },
              { icon: Send, text: 'Follow-up enviado para Pedro Costa', time: 'há 1h', color: 'text-amber-500' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5">
                <div className={`rounded-full bg-muted p-2 ${item.color}`}>
                  <item.icon className="h-3.5 w-3.5" />
                </div>
                <span className="text-sm flex-1">{item.text}</span>
                <span className="text-xs text-muted-foreground shrink-0">{item.time}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Conversas Preview ──────────────────────────────────

const mockConversations = [
  { id: '1', client: 'Ana Silva', phone: '(11) 99999-1234', lastMessage: 'Olá, gostaria de saber sobre lentes multifocais', time: '10:32', unread: 3, status: 'waiting' as const, assignedTo: 'Diego Agente' },
  { id: '2', client: 'Carlos Oliveira', phone: '(21) 98888-5678', lastMessage: 'Perfeito, vou pensar e te retorno amanhã', time: '10:15', unread: 0, status: 'active' as const, assignedTo: 'Camila Agente' },
  { id: '3', client: 'Maria Santos', phone: '(31) 97777-9012', lastMessage: 'Qual o valor do exame de vista?', time: '09:48', unread: 1, status: 'waiting' as const, assignedTo: null },
  { id: '4', client: 'Pedro Costa', phone: '(41) 96666-3456', lastMessage: 'Pode agendar para sexta às 14h?', time: '09:30', unread: 0, status: 'active' as const, assignedTo: 'Diego Agente' },
  { id: '5', client: 'Julia Ferreira', phone: '(51) 95555-7890', lastMessage: '👍', time: 'Ontem', unread: 0, status: 'resolved' as const, assignedTo: 'Camila Agente' },
  { id: '6', client: 'Lucas Mendes', phone: '(61) 94444-2345', lastMessage: 'Obrigado pelo atendimento!', time: 'Ontem', unread: 0, status: 'resolved' as const, assignedTo: 'Diego Agente' },
];

function ConversasPreview() {
  const [selected, setSelected] = useState(mockConversations[0].id);
  const conv = mockConversations.find(c => c.id === selected)!;

  return (
    <div className="-m-4 md:-m-6 flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Conversation list */}
      <div className="w-80 border-r flex flex-col shrink-0">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar conversa..." className="pl-9 h-9" />
          </div>
          <div className="flex gap-1 mt-2">
            {['Todas', 'Não lidas', 'Aguardando'].map((label, i) => (
              <Button key={label} variant={i === 0 ? 'default' : 'outline'} size="sm" className="text-xs h-7 flex-1">{label}</Button>
            ))}
          </div>
        </div>
        <ScrollArea className="flex-1">
          {mockConversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              className={cn(
                'w-full flex items-start gap-3 p-3 text-left border-b transition-colors',
                c.id === selected ? 'bg-accent' : 'hover:bg-muted/50'
              )}
            >
              <div className="relative shrink-0">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className={`${getAvatarColor(c.client)} text-white text-xs`}>
                    {c.client.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                {c.status === 'waiting' && (
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background bg-amber-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm truncate">{c.client}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0">{c.time}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{c.lastMessage}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-muted-foreground">{c.assignedTo || 'Não atribuído'}</span>
                  {c.unread > 0 && (
                    <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">{c.unread}</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </ScrollArea>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {/* Chat header */}
        <div className="h-14 border-b px-4 flex items-center gap-3 shrink-0">
          <Avatar className="h-8 w-8">
            <AvatarFallback className={`${getAvatarColor(conv.client)} text-white text-xs`}>
              {conv.client.split(' ').map(n => n[0]).join('')}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{conv.client}</p>
            <p className="text-[11px] text-muted-foreground">{conv.phone}</p>
          </div>
          <Badge variant={conv.status === 'waiting' ? 'default' : conv.status === 'active' ? 'secondary' : 'outline'} className="text-xs">
            {conv.status === 'waiting' ? 'Aguardando' : conv.status === 'active' ? 'Em andamento' : 'Resolvido'}
          </Badge>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/30">
          <div className="flex justify-center">
            <span className="text-[11px] text-muted-foreground bg-background rounded-full px-3 py-1">Hoje</span>
          </div>
          {/* Client messages */}
          <div className="flex gap-2 max-w-[75%]">
            <div className="bg-background rounded-2xl rounded-tl-sm px-3 py-2 shadow-sm">
              <p className="text-sm">{conv.lastMessage}</p>
              <span className="text-[10px] text-muted-foreground">{conv.time}</span>
            </div>
          </div>
          {/* Agent response */}
          <div className="flex gap-2 max-w-[75%] ml-auto justify-end">
            <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-3 py-2">
              <p className="text-sm">Olá! Claro, temos diversas opções. Posso te enviar nosso catálogo?</p>
              <div className="flex items-center justify-end gap-1 mt-0.5">
                <span className="text-[10px] opacity-70">10:35</span>
                <CheckCircle className="h-3 w-3 opacity-70" />
              </div>
            </div>
          </div>
        </div>

        {/* Input area */}
        <div className="p-3 border-t bg-background">
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <Input placeholder="Digite sua mensagem..." className="pr-12" />
            </div>
            <Button size="icon" className="h-9 w-9 shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CRM Preview ──────────────────────────────────────

const crmStages = [
  { name: 'Novo Lead', color: '#3b82f6', cards: [
    { client: 'Julia Ferreira', value: 890, days: 1 },
    { client: 'Lucas Mendes', value: 1250, days: 2 },
    { client: 'Mariana Lima', value: 650, days: 0 },
  ]},
  { name: 'Qualificado', color: '#8b5cf6', cards: [
    { client: 'Ana Silva', value: 2100, days: 3 },
    { client: 'Pedro Costa', value: 480, days: 5 },
  ]},
  { name: 'Proposta', color: '#f59e0b', cards: [
    { client: 'Carlos Oliveira', value: 3200, days: 4 },
  ]},
  { name: 'Negociação', color: '#10b981', cards: [
    { client: 'Maria Santos', value: 1800, days: 7 },
    { client: 'Roberto Alves', value: 4500, days: 2 },
  ]},
  { name: 'Fechado', color: '#06b6d4', cards: [
    { client: 'Fernanda Gomes', value: 2750, days: 1 },
  ]},
];

function CRMPreview() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">CRM</h1>
          <p className="text-muted-foreground">Pipeline de vendas — Kanban</p>
        </div>
        <Button><Plus className="h-4 w-4 mr-2" />Novo Lead</Button>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {crmStages.map((stage) => (
          <div key={stage.name} className="w-72 shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
              <span className="text-sm font-semibold">{stage.name}</span>
              <Badge variant="secondary" className="text-xs ml-auto">{stage.cards.length}</Badge>
            </div>
            <div className="space-y-2">
              {stage.cards.map((card, i) => (
                <Card key={i} className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className={`${getAvatarColor(card.client)} text-white text-[10px]`}>
                          {card.client.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium truncate">{card.client}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(card.value)}</span>
                      <span className="text-[11px] text-muted-foreground">{card.days === 0 ? 'Hoje' : `${card.days}d atrás`}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <button className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-muted-foreground/30 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                <Plus className="h-3.5 w-3.5" />
                Adicionar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Agenda Preview ──────────────────────────────────

const mockAppointments = [
  { time: '08:00', client: 'Ana Silva', type: 'Consulta', status: 'confirmed' },
  { time: '09:30', client: 'Carlos Oliveira', type: 'Exame de Vista', status: 'confirmed' },
  { time: '10:00', client: null, type: null, status: 'free' },
  { time: '11:00', client: 'Maria Santos', type: 'Retirada', status: 'scheduled' },
  { time: '13:00', client: null, type: null, status: 'free' },
  { time: '14:00', client: 'Pedro Costa', type: 'Consulta', status: 'confirmed' },
  { time: '15:30', client: 'Julia Ferreira', type: 'Ajuste', status: 'scheduled' },
  { time: '16:00', client: null, type: null, status: 'free' },
  { time: '17:00', client: 'Lucas Mendes', type: 'Exame de Vista', status: 'confirmed' },
];

function AgendaPreview() {
  const agendaStats: StatItem[] = [
    { label: 'Hoje', value: 6, icon: Calendar, color: 'blue' },
    { label: 'Confirmados', value: 4, icon: CheckCircle, color: 'green' },
    { label: 'Pendentes', value: 2, icon: Clock, color: 'yellow' },
    { label: 'Horários Livres', value: 3, icon: Plus, color: 'purple' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agenda</h1>
          <p className="text-muted-foreground">Sexta-feira, 28 de março de 2026</p>
        </div>
        <Button><Plus className="h-4 w-4 mr-2" />Novo Agendamento</Button>
      </div>

      <StatCards items={agendaStats} />

      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {mockAppointments.map((apt, i) => (
              <div key={i} className={cn(
                'flex items-center gap-4 px-4 py-3 transition-colors',
                apt.status === 'free' ? 'bg-muted/30' : 'hover:bg-muted/50'
              )}>
                <span className="text-sm font-mono text-muted-foreground w-12">{apt.time}</span>
                <div className="w-1 h-8 rounded-full" style={{
                  backgroundColor: apt.status === 'confirmed' ? '#10b981' : apt.status === 'scheduled' ? '#f59e0b' : '#e5e7eb'
                }} />
                {apt.client ? (
                  <div className="flex-1 flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className={`${getAvatarColor(apt.client)} text-white text-xs`}>
                        {apt.client.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{apt.client}</p>
                      <p className="text-xs text-muted-foreground">{apt.type}</p>
                    </div>
                    <Badge variant={apt.status === 'confirmed' ? 'default' : 'secondary'} className="ml-auto text-xs">
                      {apt.status === 'confirmed' ? 'Confirmado' : 'Agendado'}
                    </Badge>
                  </div>
                ) : (
                  <div className="flex-1">
                    <span className="text-sm text-muted-foreground italic">Horário disponível</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Relatório Preview ──────────────────────────────────

function RelatorioPreview() {
  const reportStats: StatItem[] = [
    { label: 'Mensagens Enviadas', value: 342, icon: Send, color: 'blue' },
    { label: 'Tempo Médio Resposta', value: '4m 32s', icon: Clock, color: 'green' },
    { label: 'Conversas Finalizadas', value: 28, icon: CheckCircle, color: 'purple' },
    { label: 'Satisfação', value: '94.2%', icon: TrendingUp, color: 'cyan' },
  ];

  const agentPerformance = [
    { name: 'Diego Agente', conversations: 45, avgResponse: '3m 12s', satisfaction: '96%' },
    { name: 'Camila Agente', conversations: 38, avgResponse: '5m 48s', satisfaction: '92%' },
    { name: 'Fernanda Gerente', conversations: 12, avgResponse: '2m 05s', satisfaction: '98%' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Relatório</h1>
          <p className="text-muted-foreground">Resumo de desempenho — Últimos 7 dias</p>
        </div>
        <div className="flex gap-1">
          {['Hoje', '7 dias', '15 dias', '30 dias'].map((label, i) => (
            <Button key={label} variant={i === 1 ? 'default' : 'outline'} size="sm" className="text-xs">{label}</Button>
          ))}
        </div>
      </div>

      <StatCards items={reportStats} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Desempenho por Agente</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agente</TableHead>
                <TableHead className="text-right">Conversas</TableHead>
                <TableHead className="text-right">Tempo Médio</TableHead>
                <TableHead className="text-right">Satisfação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agentPerformance.map((agent) => (
                <TableRow key={agent.name}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className={`${getAvatarColor(agent.name)} text-white text-[10px]`}>
                          {agent.name.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-sm">{agent.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">{agent.conversations}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{agent.avgResponse}</TableCell>
                  <TableCell className="text-right">
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">{agent.satisfaction}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Mensagens por Dia</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {mockDailyData.map((d) => (
                <div key={d.day} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-8">{d.day}</span>
                  <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                    <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${((d.leads + d.conversas) / 50) * 100}%` }} />
                  </div>
                  <span className="text-xs font-medium w-8 text-right">{d.leads + d.conversas}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Distribuição por Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { label: 'Resolvidas', value: 68, total: 100, color: 'bg-emerald-500' },
                { label: 'Em andamento', value: 22, total: 100, color: 'bg-blue-500' },
                { label: 'Aguardando', value: 8, total: 100, color: 'bg-amber-500' },
                { label: 'Canceladas', value: 2, total: 100, color: 'bg-red-500' },
              ].map((item) => (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{item.label}</span>
                    <span className="font-medium">{item.value}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Configurações Preview ──────────────────────────────

function ConfiguracoesPreview() {
  const [activeTab, setActiveTab] = useState('company');
  const tabs = [
    { id: 'company', label: 'Empresa', icon: Building2 },
    { id: 'permissions', label: 'Permissões', icon: Shield },
    { id: 'connections', label: 'Conexões', icon: Plug },
    { id: 'funnel', label: 'Funil', icon: Layers },
    { id: 'appointments', label: 'Horários', icon: Clock },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Gerencie as configurações da sua empresa</p>
      </div>

      <div className="flex gap-6">
        {/* Settings sidebar */}
        <div className="w-48 shrink-0 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors text-left',
                activeTab === tab.id ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-muted/50'
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Settings content */}
        <div className="flex-1 space-y-4">
          {activeTab === 'company' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dados da Empresa</CardTitle>
                <CardDescription>Informações gerais da sua empresa</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Nome da Empresa</label>
                    <Input defaultValue="Ótica Exemplo" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">CNPJ</label>
                    <Input defaultValue="12.345.678/0001-90" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Telefone</label>
                    <Input defaultValue="(11) 3000-1234" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email</label>
                    <Input defaultValue="contato@oticaexemplo.com.br" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Endereço</label>
                  <Input defaultValue="Rua das Flores, 123 - Centro, São Paulo - SP" />
                </div>
                <div className="flex justify-end">
                  <Button>Salvar Alterações</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'permissions' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Permissões por Função</CardTitle>
                <CardDescription>Configure o que cada função pode acessar</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Permissão</TableHead>
                      <TableHead className="text-center">Gerente</TableHead>
                      <TableHead className="text-center">Agente</TableHead>
                      <TableHead className="text-center">Visualizador</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {['Ver todas as conversas', 'Editar clientes', 'Gerenciar produtos', 'Ver relatórios', 'Configurar funil'].map((perm) => (
                      <TableRow key={perm}>
                        <TableCell className="text-sm">{perm}</TableCell>
                        <TableCell className="text-center"><Switch defaultChecked /></TableCell>
                        <TableCell className="text-center"><Switch defaultChecked={perm !== 'Configurar funil'} /></TableCell>
                        <TableCell className="text-center"><Switch defaultChecked={perm === 'Ver relatórios'} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {activeTab === 'connections' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Integrações</CardTitle>
                <CardDescription>Conexões com serviços externos</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-emerald-500/10 p-2">
                      <MessageSquare className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">WhatsApp</p>
                      <p className="text-xs text-muted-foreground">Instância: otica-exemplo-01</p>
                    </div>
                  </div>
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-0">Conectado</Badge>
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-blue-500/10 p-2">
                      <Calendar className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Google Calendar</p>
                      <p className="text-xs text-muted-foreground">Sincronizar agendamentos</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">Conectar</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'funnel' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Etapas do Funil</CardTitle>
                <CardDescription>Configure as etapas do seu funil de vendas</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {mockFunnelData.map((stage, i) => (
                    <div key={stage.name} className="flex items-center gap-3 p-3 rounded-lg border group">
                      <div className="w-3 h-8 rounded-full" style={{ backgroundColor: stage.color }} />
                      <span className="text-sm font-medium flex-1">{stage.name}</span>
                      <span className="text-xs text-muted-foreground">Posição {i + 1}</span>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" className="w-full mt-2"><Plus className="h-4 w-4 mr-2" />Nova Etapa</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'appointments' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Configuração de Horários</CardTitle>
                <CardDescription>Defina os horários disponíveis para agendamento</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Início do Expediente</label>
                    <Input type="time" defaultValue="08:00" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Fim do Expediente</label>
                    <Input type="time" defaultValue="18:00" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Duração do Slot (min)</label>
                    <Input type="number" defaultValue="30" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Intervalo entre Slots (min)</label>
                    <Input type="number" defaultValue="15" />
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <label className="text-sm font-medium">Dias Disponíveis</label>
                  <div className="flex gap-2">
                    {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((day, i) => (
                      <Button key={day} variant={i < 5 ? 'default' : i === 5 ? 'outline' : 'ghost'} size="sm" className="text-xs w-12">{day}</Button>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button>Salvar Configurações</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Clients Preview ──────────────────────────────────────

function ClientsPreview() {
  const clientStats: StatItem[] = [
    { label: 'Total de Clientes', value: 142, icon: Users, color: 'blue' },
    { label: 'Ativos', value: 128, icon: UserCheck, color: 'green' },
    { label: 'Novos (30 dias)', value: 23, icon: ContactRound, color: 'purple' },
    { label: 'Receita Total', value: 'R$ 87.400', icon: DollarSign, color: 'cyan' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">Gerencie sua base de clientes</p>
        </div>
        <Button><Plus className="h-4 w-4 mr-2" />Novo Cliente</Button>
      </div>

      <StatCards items={clientStats} />

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, email ou telefone..." className="pl-9" />
        </div>
        <div className="flex gap-1">
          <Button variant="default" size="sm" className="text-xs">Todos</Button>
          <Button variant="outline" size="sm" className="text-xs">Ativos</Button>
          <Button variant="outline" size="sm" className="text-xs">Inativos</Button>
        </div>
      </div>

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
            {mockClients.map((client) => (
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
                <TableCell className="text-muted-foreground">{client.email}</TableCell>
                <TableCell className="text-muted-foreground">{client.phone}</TableCell>
                <TableCell className="text-muted-foreground">{client.document_number || '-'}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${client.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                    <span className="text-xs">{client.is_active ? 'Ativo' : 'Inativo'}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{new Date(client.created_at).toLocaleDateString('pt-BR')}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-8 w-8"><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between pt-2">
        <span className="text-sm text-muted-foreground">142 cliente(s) — Página 1 de 6</span>
      </div>
    </div>
  );
}

// ── Products Preview ──────────────────────────────────────

function ProductsPreview() {
  const productStats: StatItem[] = [
    { label: 'Total Cadastrados', value: 48, icon: Package, color: 'blue' },
    { label: 'Ativos', value: 42, icon: PackageCheck, color: 'green' },
    { label: 'Serviços', value: 12, icon: Wrench, color: 'purple', subtitle: '36 produtos' },
    { label: 'Margem Média', value: '52.3%', icon: TrendingUp, color: 'cyan' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Produtos & Serviços</h1>
          <p className="text-muted-foreground">Gerencie seu catálogo de produtos e serviços</p>
        </div>
        <Button><Plus className="h-4 w-4 mr-2" />Novo Produto</Button>
      </div>

      <StatCards items={productStats} />

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, SKU ou categoria..." className="pl-9" />
        </div>
        <div className="flex gap-1">
          <Button variant="default" size="sm" className="text-xs">Todos</Button>
          <Button variant="outline" size="sm" className="text-xs">Produtos</Button>
          <Button variant="outline" size="sm" className="text-xs">Serviços</Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Preço</TableHead>
              <TableHead className="text-right">Custo</TableHead>
              <TableHead className="text-right">Margem</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockProducts.map((product) => {
              const margin = product.cost ? ((product.price - product.cost) / product.price) * 100 : null;
              return (
                <TableRow key={product.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className={`rounded-md p-1.5 ${product.is_service ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'}`}>
                        {product.is_service ? <Wrench className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
                      </div>
                      <span className="font-medium">{product.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{product.sku}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs font-normal">{product.category}</Badge></TableCell>
                  <TableCell><Badge variant="secondary" className="text-xs">{product.is_service ? 'Serviço' : 'Produto'}</Badge></TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(product.price)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{product.cost ? formatCurrency(product.cost) : '-'}</TableCell>
                  <TableCell className="text-right">
                    {margin !== null ? (
                      <span className={margin >= 30 ? 'text-emerald-600 dark:text-emerald-400 font-medium' : margin >= 15 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}>
                        {margin.toFixed(1)}%
                      </span>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${product.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                      <span className="text-xs">{product.is_active ? 'Ativo' : 'Inativo'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-8 w-8"><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Team Preview ──────────────────────────────────────

function TeamPreview() {
  const teamStats: StatItem[] = [
    { label: 'Total Membros', value: 5, icon: Users, color: 'blue' },
    { label: 'Ativos', value: 4, icon: UserCheck, color: 'green' },
    { label: 'Inativos', value: 1, icon: UserX, color: 'red' },
    { label: 'Online (24h)', value: 2, icon: Clock, color: 'cyan' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Equipe</h1>
          <p className="text-muted-foreground text-sm">Gerencie os membros da sua equipe</p>
        </div>
        <Button><UserPlus className="mr-2 h-4 w-4" />Convidar Membro</Button>
      </div>

      <StatCards items={teamStats} />

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou email..." className="pl-9" />
        </div>
        <div className="flex gap-1">
          {['Todos', 'Admins', 'Gerentes', 'Agentes'].map((label, i) => (
            <Button key={label} variant={i === 0 ? 'default' : 'outline'} size="sm" className="text-xs hidden sm:inline-flex">{label}</Button>
          ))}
        </div>
      </div>

      <div className="border rounded-lg">
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
            {mockTeam.map((member) => {
              const ri = roleLabels[member.role];
              const RoleIcon = ri.icon;
              return (
                <TableRow key={member.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar>
                          <AvatarFallback className={`${getAvatarColor(member.full_name)} text-white text-xs`}>
                            {member.full_name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${member.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                      </div>
                      <div>
                        <div className="font-medium">{member.full_name}</div>
                        <div className="text-sm text-muted-foreground">{member.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className={`rounded-md p-1 ${ri.bg}`}>
                        <RoleIcon className={`h-3.5 w-3.5 ${ri.color}`} />
                      </div>
                      <span className="text-sm">{ri.label}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch checked={member.is_active} />
                      <span className="text-xs text-muted-foreground">{member.is_active ? 'Ativo' : 'Inativo'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {member.last_seen_at
                      ? new Date(member.last_seen_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : <span className="text-xs italic">Nunca acessou</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Follow-ups Preview ──────────────────────────────────

function FollowUpsPreview() {
  const fuStats: StatItem[] = [
    { label: 'Pendentes', value: 5, icon: Clock, color: 'yellow' },
    { label: 'Enviados', value: 23, icon: CheckCircle, color: 'green' },
    { label: 'Falhados', value: 2, icon: XCircle, color: 'red' },
    { label: 'Taxa de Sucesso', value: '82.1%', icon: TrendingUp, color: 'cyan' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Follow-ups</h1>
        <p className="text-muted-foreground">Gerencie todos os jobs de follow-up automáticos</p>
      </div>

      <StatCards items={fuStats} />

      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por cliente ou telefone..." className="pl-9" />
          </div>
        </div>
        <div className="flex gap-1">
          {['Todos', 'Pendentes', 'Enviados', 'Falhados'].map((label, i) => (
            <Button key={label} variant={i === 0 ? 'default' : 'outline'} size="sm" className="text-xs">{label}</Button>
          ))}
        </div>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Etapa</TableHead>
              <TableHead>Agendado Para</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tentativas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockFollowUps.map((job) => {
              const sc = statusConfig[job.status];
              return (
                <TableRow key={job.id} className="group">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{job.client_name}</span>
                      <span className="text-xs text-muted-foreground">{job.phone}</span>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">Follow-up {job.stage_order}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm">{new Date(job.scheduled_for).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
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
                        <span key={i} className={`h-1.5 w-4 rounded-full ${i < job.attempts ? sc.color : 'bg-muted'}`} />
                      ))}
                      <span className="text-xs text-muted-foreground ml-1">{job.attempts}/3</span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Departments Preview ──────────────────────────────────

function DepartmentsPreview() {
  const deptStats: StatItem[] = [
    { label: 'Departamentos', value: 3, icon: Building2, color: 'blue' },
    { label: 'Total Membros', value: 5, icon: Users, color: 'green' },
    { label: 'Média por Depto', value: '1.7', icon: Layers, color: 'purple' },
    { label: 'Equipe Disponível', value: 5, icon: UserPlus, color: 'cyan' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Departamentos</h1>
          <p className="text-muted-foreground text-sm">Gerencie os departamentos e seus membros</p>
        </div>
        <Button><Plus className="mr-2 h-4 w-4" />Novo Departamento</Button>
      </div>

      <StatCards items={deptStats} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {mockDepartments.map((dept) => (
          <Card key={dept.id} className="relative group">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-8 rounded-full shrink-0" style={{ backgroundColor: dept.color }} />
                  <div>
                    <CardTitle className="text-base">{dept.name}</CardTitle>
                    <CardDescription className="text-xs mt-0.5">{dept.description}</CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{dept.members.length} {dept.members.length === 1 ? 'membro' : 'membros'}</span>
              </div>
              <div className="space-y-1.5">
                {dept.members.length === 0 && (
                  <button className="w-full flex items-center justify-center gap-2 py-3 rounded-md border border-dashed border-muted-foreground/30 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                    <UserPlus className="h-3.5 w-3.5" />
                    Adicionar primeiro membro
                  </button>
                )}
                {dept.members.map((name) => (
                  <div key={name} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-md bg-muted/50">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className={`${getAvatarColor(name)} text-white text-[10px]`}>
                          {name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm truncate">{name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

'use client'

import { ReactNode, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { useImpersonation } from '@/hooks/useImpersonation';
import { useTotalUnreadConversations } from '@/hooks/useTotalUnreadConversations';
import { useSidebarCounts } from '@/hooks/useSidebarCounts';
import { useIsMobile } from '@/hooks/use-mobile';
import { useWhatsAppStatus } from '@/hooks/useWhatsAppStatus';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from '@/components/ui/command';
import {
  LayoutDashboard,
  Kanban,
  Users,
  MessageSquare,
  UserCog,
  Settings,
  LogOut,
  Clock,
  FileText,
  ArrowLeft,
  Shield,
  Code,
  Menu,
  X,
  Bot,
  Inbox,
  LifeBuoy,
  BookOpen,
  ChevronsUpDown,
  Building2,
  ChevronRight,
  Wifi,
  WifiOff,
  Search,
  Plus,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { WhatsAppStatusIndicator } from '@/components/WhatsAppStatusIndicator';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { PushNotificationsToggle } from '@/components/PushNotificationsToggle';
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';
import { cn } from '@/lib/utils';
import { useBranding } from '@/hooks/useBranding';

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  roles: string[];
  requirePermission?: string;
  impersonationOnly?: boolean;
  countKey?: 'unread' | 'appointmentsToday' | 'pendingFollowUps';
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: 'Principal',
    items: [
      { name: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard, roles: ['viewer', 'agent', 'manager', 'company_admin'] },
      { name: 'Conversas', href: '/app/conversations', icon: MessageSquare, roles: ['agent', 'manager', 'company_admin'], countKey: 'unread' },
      { name: 'CRM', href: '/app/crm', icon: Kanban, roles: ['agent', 'manager', 'company_admin'] },
    ],
  },
  {
    label: 'Vendas',
    items: [
      { name: 'Clientes', href: '/app/clients', icon: Users, roles: ['viewer', 'agent', 'manager', 'company_admin'], requirePermission: 'can_access_crm' },
      { name: 'Follow-ups', href: '/app/follow-ups', icon: Clock, roles: ['manager', 'company_admin'], countKey: 'pendingFollowUps' },
    ],
  },
  {
    label: 'Relatórios',
    items: [
      { name: 'Relatório', href: '/app/daily-report', icon: FileText, roles: ['agent', 'manager', 'company_admin'] },
    ],
  },
  {
    label: 'Administração',
    items: [
      { name: 'Equipe', href: '/app/team', icon: UserCog, roles: ['company_admin'] },
      { name: 'Departamentos', href: '/app/departments', icon: Building2, roles: ['company_admin'] },
      { name: 'Conexões', href: '/app/inboxes', icon: Inbox, roles: ['company_admin'] },
      { name: 'API Docs', href: '/app/api-docs', icon: Code, roles: ['manager', 'company_admin'] },
    ],
  },
];

const allNavItems = navGroups.flatMap(g => g.items);

function getPageTitle(pathname: string): string {
  const item = allNavItems.find(i => pathname.startsWith(i.href));
  return item?.name || '';
}

function getBreadcrumb(pathname: string): { label: string; href: string }[] {
  for (const group of navGroups) {
    const item = group.items.find(i => pathname.startsWith(i.href));
    if (item) {
      return [
        { label: group.label, href: '' },
        { label: item.name, href: item.href },
      ];
    }
  }
  return [];
}

const roleDisplayNames: Record<string, string> = {
  company_admin: 'Administrador',
  manager: 'Gerente',
  agent: 'Agente',
  viewer: 'Visualizador',
  super_admin: 'Super Admin',
};

export default function CompanyLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, companyId, signOut, isSuperAdmin } = useAuth();
  const { permissions } = useUserPermissions();
  const { isImpersonating, impersonatedCompanyId, impersonatedCompanyName, stopImpersonation } = useImpersonation();
  const { data: unreadCount = 0 } = useTotalUnreadConversations();
  const { appointmentsToday, pendingFollowUps } = useSidebarCounts();
  const { status: whatsAppStatus } = useWhatsAppStatus();
  const { branding } = useBranding();
  const isMobile = useIsMobile();
  const [companyName, setCompanyName] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const effectiveCompanyId = isImpersonating ? impersonatedCompanyId : companyId;
  const effectiveCompanyName = isImpersonating ? impersonatedCompanyName : companyName;

  useEffect(() => {
    if (effectiveCompanyId && !isImpersonating) {
      fetchCompanyName();
    }
  }, [effectiveCompanyId, isImpersonating]);

  const fetchCompanyName = async () => {
    if (!effectiveCompanyId) return;
    try {
      const res = await fetch(`/api/companies?id=${effectiveCompanyId}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.name) setCompanyName(data.name);
      }
    } catch (e) {
      console.error('Failed to fetch company name:', e);
    }
  };

  const handleStopImpersonation = () => {
    stopImpersonation();
    router.push('/super-admin/companies');
  };

  const handleSignOut = async () => {
    await signOut();
  };

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [pathname, isMobile]);

  const filterNavItem = (item: NavItem): boolean => {
    if (item.impersonationOnly && !isImpersonating) return false;
    if (isSuperAdmin) return item.roles.includes('company_admin');
    if (!item.roles.includes(role || '')) return false;
    if (role && ['super_admin', 'company_admin', 'manager'].includes(role)) return true;
    if (item.requirePermission) {
      return !!permissions[item.requirePermission as keyof typeof permissions];
    }
    return true;
  };

  const getCountForItem = (item: NavItem): number => {
    if (!item.countKey) return 0;
    if (item.countKey === 'unread') return unreadCount;
    if (item.countKey === 'appointmentsToday') return appointmentsToday;
    if (item.countKey === 'pendingFollowUps') return pendingFollowUps;
    return 0;
  };

  const [commandOpen, setCommandOpen] = useState(false);

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen(open => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const handleCommandSelect = useCallback((href: string) => {
    setCommandOpen(false);
    router.push(href);
  }, [router]);

  const pageTitle = getPageTitle(pathname);
  const breadcrumb = getBreadcrumb(pathname);
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || '';
  const userInitials = userName
    ? userName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
    : user?.email?.charAt(0).toUpperCase() || '?';

  // Summary counts for the day-at-a-glance card
  const totalDayActivity = unreadCount + appointmentsToday + pendingFollowUps;

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Impersonation banner */}
      {isImpersonating && (
        <div className="flex items-center justify-between bg-amber-500 px-3 md:px-4 py-2 text-amber-950 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Shield className="h-4 w-4 shrink-0" />
            <span className="text-xs md:text-sm font-medium truncate">
              <span className="hidden sm:inline">Visualizando como: </span>
              <strong>{impersonatedCompanyName}</strong>
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleStopImpersonation}
            className="gap-1 text-amber-950 hover:bg-amber-600 hover:text-amber-950 shrink-0 text-xs md:text-sm h-8"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Voltar ao Super Admin</span>
            <span className="sm:hidden">Voltar</span>
          </Button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Mobile overlay */}
        {isMobile && sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ───────── SIDEBAR ───────── */}
        <aside className={cn(
          'border-r border-sidebar-border bg-sidebar flex flex-col',
          isMobile
            ? `fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
            : 'w-64'
        )}>
          {/* ── Company Header (card) ── */}
          <div
            className="px-3"
            style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
          >
            <div className="flex items-center gap-3 rounded-xl border border-sidebar-border/60 bg-sidebar-accent/30 px-3 py-3 backdrop-blur-sm">
              <div className="relative shrink-0">
                {branding.logoUrl ? (
                  <Image src={branding.logoUrl} alt={branding.systemName} width={36} height={36} className="rounded-xl" />
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-sm">
                    <span className="text-primary-foreground text-sm font-bold tracking-tight">W</span>
                  </div>
                )}
                <span className={cn(
                  'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-sidebar',
                  whatsAppStatus === 'connected' ? 'bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.2)]' :
                  whatsAppStatus === 'connecting' ? 'bg-amber-500 animate-pulse' :
                  'bg-gray-400'
                )} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-sidebar-foreground truncate tracking-tight">
                  {effectiveCompanyName || branding.systemName}
                </p>
                <p className="text-[10.5px] text-sidebar-foreground/50 truncate mt-0.5">
                  {whatsAppStatus === 'connected' ? '● WhatsApp conectado' :
                   whatsAppStatus === 'connecting' ? '● Conectando...' :
                   whatsAppStatus === 'no_instance' ? '○ Não configurado' :
                   '○ Desconectado'}
                </p>
              </div>
              {isMobile && (
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-sidebar-foreground" onClick={() => setSidebarOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* ── Search Trigger (Cmd+K) ── */}
          <div className="px-3 pt-3">
            <button
              onClick={() => setCommandOpen(true)}
              className="flex w-full items-center gap-2 rounded-xl border border-sidebar-border/60 bg-sidebar-accent/30 px-3 py-2.5 text-sm text-sidebar-foreground/50 transition-all hover:bg-sidebar-accent/60 hover:text-sidebar-foreground hover:border-sidebar-border"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="flex-1 text-left text-[12.5px]">Buscar...</span>
              <kbd className="pointer-events-none hidden h-5 select-none items-center gap-0.5 rounded-md border border-sidebar-border bg-sidebar/50 px-1.5 font-mono text-[10px] font-medium text-sidebar-foreground/40 sm:flex">
                <span className="text-[11px]">⌘</span>K
              </kbd>
            </button>
          </div>

          {/* ── Day at a Glance (card destacado) ── */}
          {totalDayActivity > 0 && (
            <div className="px-3 pt-3">
              <div className="rounded-xl border border-sidebar-border/60 bg-gradient-to-br from-sidebar-accent/50 to-sidebar-accent/20 p-3.5 space-y-2.5">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-sidebar-primary" />
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/60">
                    Hoje
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {unreadCount > 0 && (
                    <Link href="/app/conversations" className="text-center group/stat rounded-lg py-1 hover:bg-sidebar-accent/40 transition-colors">
                      <p className="text-xl font-bold text-sidebar-foreground leading-none group-hover/stat:text-sidebar-primary transition-colors tabular-nums">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </p>
                      <p className="text-[9.5px] text-sidebar-foreground/50 mt-1 font-medium">conversas</p>
                    </Link>
                  )}
                  {pendingFollowUps > 0 && (
                    <Link href="/app/follow-ups" className="text-center group/stat rounded-lg py-1 hover:bg-sidebar-accent/40 transition-colors">
                      <p className="text-xl font-bold text-sidebar-foreground leading-none group-hover/stat:text-sidebar-primary transition-colors tabular-nums">
                        {pendingFollowUps}
                      </p>
                      <p className="text-[9.5px] text-sidebar-foreground/50 mt-1 font-medium">follow-ups</p>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="h-3" />

          {/* ── Navigation ── */}
          <ScrollArea className="flex-1 py-2">
            <TooltipProvider delayDuration={0}>
              {navGroups.map((group, groupIndex) => {
                const visibleItems = group.items.filter(filterNavItem);
                if (visibleItems.length === 0) return null;

                return (
                  <div key={group.label} className={cn('px-3', groupIndex > 0 && 'mt-5')}>
                    <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/40 mb-2 px-2">
                      {group.label}
                    </p>
                    <nav className="space-y-0.5">
                      {visibleItems.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                        const count = getCountForItem(item);

                        return (
                          <Tooltip key={item.name}>
                            <TooltipTrigger asChild>
                              <Link
                                href={item.href}
                                className={cn(
                                  'group/nav relative flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-[13px] font-medium transition-all duration-150',
                                  isActive
                                    ? 'bg-sidebar-accent/70 text-sidebar-foreground shadow-sm'
                                    : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground'
                                )}
                              >
                                {isActive && (
                                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full bg-sidebar-primary" />
                                )}
                                <div className={cn(
                                  'flex h-7 w-7 items-center justify-center rounded-lg transition-colors shrink-0',
                                  isActive
                                    ? 'bg-sidebar-primary/15'
                                    : 'bg-sidebar-accent/40 group-hover/nav:bg-sidebar-accent/70'
                                )}>
                                  <item.icon className={cn(
                                    'h-[14px] w-[14px] transition-colors',
                                    isActive
                                      ? 'text-sidebar-primary'
                                      : 'text-sidebar-foreground/70 group-hover/nav:text-sidebar-foreground'
                                  )} />
                                </div>
                                <span className="flex-1 truncate tracking-tight">{item.name}</span>

                                {count > 0 && (
                                  <span className={cn(
                                    'ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums',
                                    item.countKey === 'unread'
                                      ? 'bg-destructive text-destructive-foreground shadow-sm'
                                      : 'bg-sidebar-foreground/10 text-sidebar-foreground/80'
                                  )}>
                                    {count > 99 ? '99+' : count}
                                  </span>
                                )}
                              </Link>
                            </TooltipTrigger>
                            {count > 0 && (
                              <TooltipContent side="right" className="text-xs">
                                {item.countKey === 'unread' && `${count} conversa(s) não lida(s)`}
                                {item.countKey === 'appointmentsToday' && `${count} agendamento(s) hoje`}
                                {item.countKey === 'pendingFollowUps' && `${count} follow-up(s) pendente(s)`}
                              </TooltipContent>
                            )}
                          </Tooltip>
                        );
                      })}
                    </nav>
                  </div>
                );
              })}
            </TooltipProvider>
          </ScrollArea>

          <Separator className="bg-sidebar-border" />

          {/* ── User Footer ── */}
          <div className="p-2 pb-[env(safe-area-inset-bottom)]">
            {/* Quick actions row */}
            <div className="flex items-center gap-1 px-1 mb-2">
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                      onClick={() => router.push('/app/settings')}
                    >
                      <Settings className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">Configurações</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                      onClick={() => router.push('/app/support')}
                    >
                      <LifeBuoy className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">Suporte</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <PushNotificationsToggle variant="compact" />
              <div className="flex-1" />
              <ThemeToggle />
            </div>

            {/* User card */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-xl border border-sidebar-border/60 bg-sidebar-accent/30 px-3 py-2.5 text-sm transition-all hover:bg-sidebar-accent/60 hover:border-sidebar-border cursor-pointer">
                  <div className="relative">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className="text-xs font-semibold bg-gradient-to-br from-sidebar-primary to-sidebar-primary/80 text-sidebar-primary-foreground">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-sidebar bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.2)]" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-[13px] font-semibold text-sidebar-foreground truncate tracking-tight">
                      {userName}
                    </p>
                    <p className="text-[10.5px] text-sidebar-foreground/50 truncate mt-0.5">
                      {roleDisplayNames[role || ''] || role}
                    </p>
                  </div>
                  <ChevronsUpDown className="h-3.5 w-3.5 text-sidebar-foreground/30 shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-60">
                <div className="flex items-center gap-3 p-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="text-sm font-semibold bg-primary text-primary-foreground">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{userName}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <div className="px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Empresa</span>
                    <span className="text-xs font-medium truncate max-w-[140px]">{effectiveCompanyName}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-muted-foreground">Funcao</span>
                    <span className="text-xs font-medium">{roleDisplayNames[role || ''] || role}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-muted-foreground">WhatsApp</span>
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        whatsAppStatus === 'connected' ? 'bg-brand-primary' :
                        whatsAppStatus === 'connecting' ? 'bg-amber-500' :
                        'bg-red-500'
                      )} />
                      <span className="text-xs font-medium">
                        {whatsAppStatus === 'connected' ? 'Online' :
                         whatsAppStatus === 'connecting' ? 'Conectando' : 'Offline'}
                      </span>
                    </div>
                  </div>
                </div>
                <DropdownMenuSeparator />
                {(isImpersonating || isSuperAdmin) && (
                  <>
                    <DropdownMenuItem
                      onClick={isImpersonating ? handleStopImpersonation : () => router.push('/super-admin/companies')}
                      className="text-amber-500 focus:text-amber-500"
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Voltar ao Super Admin
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair da conta
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </aside>

        {/* ───────── MAIN CONTENT ───────── */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top header */}
          <header className="flex h-14 items-center gap-3 border-b border-border px-4 shrink-0 pt-[env(safe-area-inset-top)]">
            {isMobile && (
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setSidebarOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
            )}

            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 min-w-0">
              {breadcrumb.map((crumb, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />}
                  {i === 0 ? (
                    <span className="text-xs text-muted-foreground hidden sm:inline">{crumb.label}</span>
                  ) : (
                    <h1 className="text-lg font-semibold truncate">{crumb.label}</h1>
                  )}
                </div>
              ))}
              {breadcrumb.length === 0 && (
                <h1 className="text-lg font-semibold truncate">{pageTitle}</h1>
              )}
            </div>

            <div className="flex-1" />

            {/* Header right actions */}
            <WhatsAppStatusIndicator />
          </header>

          <main className={cn(
            'flex-1',
            pathname === '/app/conversations'
              ? 'overflow-hidden'
              : 'overflow-y-auto p-4 md:p-6',
            // Espaco extra no mobile pro bottom nav nao cobrir o conteudo
            isMobile && pathname !== '/app/conversations' && 'pb-28'
          )}>
            {children}
          </main>
        </div>
      </div>

      {/* Bottom nav flutuante (mobile) */}
      {isMobile && (
        <MobileBottomNav
          unreadCount={unreadCount}
          appointmentsToday={appointmentsToday}
          onOpenMenu={() => setSidebarOpen(true)}
        />
      )}

      {/* Banner de instalacao PWA (Android + iOS com instrucoes) */}
      <PwaInstallPrompt />

      {/* ── Command Palette (Ctrl+K) ── */}
      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="Buscar paginas, acoes..." />
        <CommandList>
          <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
          {navGroups.map(group => {
            const visibleItems = group.items.filter(filterNavItem);
            if (visibleItems.length === 0) return null;
            return (
              <CommandGroup key={group.label} heading={group.label}>
                {visibleItems.map(item => (
                  <CommandItem
                    key={item.href}
                    onSelect={() => handleCommandSelect(item.href)}
                    className="gap-3"
                  >
                    <item.icon className="h-4 w-4 text-muted-foreground" />
                    <span>{item.name}</span>
                    {getCountForItem(item) > 0 && (
                      <Badge variant="secondary" className="ml-auto text-[10px] h-5 px-1.5">
                        {getCountForItem(item)}
                      </Badge>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
          <CommandGroup heading="Acoes rapidas">
            <CommandItem onSelect={() => handleCommandSelect('/app/clients')} className="gap-3">
              <Plus className="h-4 w-4 text-muted-foreground" />
              <span>Novo cliente</span>
              <CommandShortcut>cliente</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => handleCommandSelect('/app/conversations')} className="gap-3">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span>Abrir conversas</span>
              <CommandShortcut>chat</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}

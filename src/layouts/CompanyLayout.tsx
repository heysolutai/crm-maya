'use client'

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { useImpersonation } from '@/hooks/useImpersonation';
import { useTotalUnreadConversations } from '@/hooks/useTotalUnreadConversations';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  LayoutDashboard,
  Kanban,
  Users,
  MessageSquare,
  Calendar,
  UserCog,
  Settings,
  LogOut,
  Package,
  Clock,
  FileText,
  ArrowLeft,
  Shield,
  Code,
  Menu,
  X,
  Bot,
  LifeBuoy,
  BookOpen,
  ChevronsUpDown,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { ThemeToggle } from '@/components/ThemeToggle';
import { WhatsAppStatusIndicator } from '@/components/WhatsAppStatusIndicator';

interface NavItem {
  name: string;
  href: string;
  icon: any;
  roles: string[];
  requirePermission?: string;
  impersonationOnly?: boolean;
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
      { name: 'Conversas', href: '/app/conversations', icon: MessageSquare, roles: ['agent', 'manager', 'company_admin'] },
      { name: 'CRM', href: '/app/crm', icon: Kanban, roles: ['agent', 'manager', 'company_admin'] },
    ],
  },
  {
    label: 'Vendas',
    items: [
      { name: 'Clientes', href: '/app/clients', icon: Users, roles: ['viewer', 'agent', 'manager', 'company_admin'], requirePermission: 'can_access_crm' },
      { name: 'Produtos', href: '/app/products', icon: Package, roles: ['agent', 'manager', 'company_admin'] },
      { name: 'Agenda', href: '/app/appointments', icon: Calendar, roles: ['agent', 'manager', 'company_admin'] },
      { name: 'Follow-ups', href: '/app/follow-ups', icon: Clock, roles: ['manager', 'company_admin'] },
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
      { name: 'IA', href: '/app/ai-settings', icon: Bot, roles: ['company_admin'] },
      { name: 'Prompts', href: '/app/prompt-library', icon: BookOpen, roles: ['viewer', 'agent', 'manager', 'company_admin'] },
      { name: 'API Docs', href: '/app/api-docs', icon: Code, roles: ['manager', 'company_admin'] },
      { name: 'Configurações', href: '/app/settings', icon: Settings, roles: ['company_admin'] },
      { name: 'Suporte', href: '/app/support', icon: LifeBuoy, roles: ['viewer', 'agent', 'manager', 'company_admin'] },
    ],
  },
];

// Flat map for page title lookup
const allNavItems = navGroups.flatMap(g => g.items);

function getPageTitle(pathname: string): string {
  const item = allNavItems.find(i => pathname.startsWith(i.href));
  return item?.name || '';
}

export default function CompanyLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, companyId, signOut, isSuperAdmin } = useAuth();
  const { permissions } = useUserPermissions();
  const { isImpersonating, impersonatedCompanyId, impersonatedCompanyName, stopImpersonation } = useImpersonation();
  const { data: unreadCount = 0 } = useTotalUnreadConversations();
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

    const { data, error } = await supabase
      .from('companies')
      .select('name')
      .eq('id', effectiveCompanyId)
      .single();

    if (data && !error) {
      setCompanyName(data.name);
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
    if (isMobile) {
      setSidebarOpen(false);
    }
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

  const pageTitle = getPageTitle(pathname);

  return (
    <div className="flex h-screen flex-col bg-background">
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

        {/* Sidebar */}
        <aside className={`
          ${isMobile
            ? `fixed inset-y-0 left-0 z-50 w-60 transform transition-transform duration-200 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
            : 'w-60'
          } border-r border-sidebar-border bg-sidebar flex flex-col
        `}>
          {/* Logo + Company name */}
          <div className="flex items-center gap-3 border-b border-sidebar-border px-4 h-14 shrink-0 pt-[env(safe-area-inset-top)]">
            <Image
              src="/logo-mileto.png"
              alt="MiletoIA"
              width={28}
              height={28}
              className="shrink-0 rounded"
            />
            <span className="text-sm font-semibold text-sidebar-foreground truncate flex-1">
              {effectiveCompanyName || 'MiletoIA'}
            </span>
            {isMobile && (
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-sidebar-foreground" onClick={() => setSidebarOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 py-2">
            {navGroups.map((group) => {
              const visibleItems = group.items.filter(filterNavItem);
              if (visibleItems.length === 0) return null;

              return (
                <div key={group.label} className="mb-1">
                  <p className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                    {group.label}
                  </p>
                  <nav className="space-y-0.5 px-2">
                    {visibleItems.map((item) => {
                      const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                            isActive
                              ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                              : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                          }`}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span className="flex-1 truncate">{item.name}</span>
                          {item.name === 'Conversas' && unreadCount > 0 && (
                            <Badge
                              variant="destructive"
                              className="ml-auto h-5 min-w-[20px] px-1.5 rounded-full text-[10px] font-semibold"
                            >
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </Badge>
                          )}
                        </Link>
                      );
                    })}
                  </nav>
                </div>
              );
            })}
          </ScrollArea>

          {/* User section at bottom */}
          <div className="border-t border-sidebar-border p-2 pb-[env(safe-area-inset-bottom)]">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent cursor-pointer">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="text-xs bg-sidebar-primary text-sidebar-primary-foreground">
                      {user?.email?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium text-sidebar-foreground truncate">
                      {user?.user_metadata?.full_name || user?.email?.split('@')[0]}
                    </p>
                    <p className="text-[11px] text-sidebar-foreground/60 capitalize truncate">
                      {role?.replace('_', ' ')}
                    </p>
                  </div>
                  <ChevronsUpDown className="h-4 w-4 text-sidebar-foreground/50 shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <div className="flex flex-col space-y-1 p-2">
                  <p className="text-sm font-medium">{user?.email}</p>
                  <p className="text-xs text-muted-foreground">{effectiveCompanyName}</p>
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
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </aside>

        {/* Main content area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top header */}
          <header className="flex h-14 items-center gap-3 border-b border-border px-4 shrink-0 pt-[env(safe-area-inset-top)]">
            {isMobile && (
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setSidebarOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <h1 className="text-lg font-semibold truncate">{pageTitle}</h1>
            <div className="flex-1" />
            <WhatsAppStatusIndicator />
            <ThemeToggle />
          </header>

          <main className={`flex-1 ${
            pathname === '/app/conversations'
              ? 'overflow-hidden'
              : 'overflow-y-auto p-4 md:p-6'
          }`}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

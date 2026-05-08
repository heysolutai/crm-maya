'use client'

import { ReactNode, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  LayoutDashboard,
  Building2,
  LogOut,
  Code,
  DollarSign,
  Shield,
  Users,
  Bell,
  Search,
  Menu,
  X,
  Settings,
  Server,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import Image from 'next/image';
import { useBranding } from '@/hooks/useBranding';

const navigation = [
  { name: 'Dashboard', href: '/super-admin/dashboard', icon: LayoutDashboard },
  { name: 'Empresas', href: '/super-admin/companies', icon: Building2 },
  { name: 'Usuários', href: '/super-admin/users', icon: Users },
  { name: 'Super Admins', href: '/super-admin/admins', icon: Shield },
  { name: 'Custos de IA', href: '/super-admin/token-dashboard', icon: DollarSign },
  { name: 'API Docs', href: '/super-admin/api-docs', icon: Code },
  { name: 'Sistema', href: '/super-admin/system-settings', icon: Server },
  { name: 'Configurações', href: '/super-admin/settings', icon: Settings },
];

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { branding } = useBranding();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
  };

  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [pathname, isMobile]);

  const userInitial = user?.email?.charAt(0).toUpperCase() || 'A';

  const sidebarContent = (
    <>
      <div className="flex h-16 items-center gap-3 px-5 pt-[env(safe-area-inset-top)]">
        {branding.logoUrl ? (
          <Image src={branding.logoUrl} alt={branding.systemName} width={32} height={32} className="rounded-lg" />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground text-sm font-bold">W</span>
          </div>
        )}
        <div className="flex flex-col">
          <span className="text-sm font-bold leading-tight">{branding.systemName}</span>
          <span className="text-[10px] text-muted-foreground leading-tight">Management Console</span>
        </div>
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-8 w-8 rounded-xl"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/super-admin/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      <div className="p-3 border-t border-border/30">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sair da conta
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-background">
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {isMobile ? (
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col border-r border-border/50 bg-card transition-transform duration-200 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {sidebarContent}
        </aside>
      ) : (
        <aside className="w-64 flex flex-col border-r border-border/50 bg-card/50">
          {sidebarContent}
        </aside>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex min-h-[4rem] items-center justify-between px-4 md:px-6 border-b border-border/30 bg-card/80 backdrop-blur-sm pt-[env(safe-area-inset-top)]">
          <div className="flex items-center gap-3">
            {isMobile && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <div className="relative w-48 md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar empresas..."
                className="pl-9 h-9 rounded-xl bg-muted/50 border-border/30 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground">
              <Bell className="h-4 w-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-accent transition-colors">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-medium leading-tight">Admin User</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">Super Admin</p>
                  </div>
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                      {userInitial}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl">
                <div className="flex flex-col space-y-1 p-2">
                  <p className="text-sm font-medium">{user?.email}</p>
                  <p className="text-xs text-muted-foreground">Super Administrador</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="rounded-lg">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

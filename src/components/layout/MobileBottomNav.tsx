'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  MessageSquare,
  Kanban,
  Calendar,
  Menu,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href?: string;
  icon: LucideIcon;
  action?: 'open-menu';
  badge?: number;
}

interface MobileBottomNavProps {
  unreadCount?: number;
  appointmentsToday?: number;
  onOpenMenu: () => void;
}

/**
 * Bottom nav flutuante estilo PWA: pill branco arredondado com indicador
 * circular que desliza pro item ativo, tipo "bolha" saindo da barra.
 */
export function MobileBottomNav({
  unreadCount = 0,
  appointmentsToday = 0,
  onOpenMenu,
}: MobileBottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  const items: NavItem[] = [
    { label: 'Início',    href: '/app/dashboard',     icon: LayoutDashboard },
    { label: 'Conversas', href: '/app/conversations', icon: MessageSquare, badge: unreadCount },
    { label: 'CRM',       href: '/app/crm',           icon: Kanban },
    { label: 'Agenda',    href: '/app/appointments',  icon: Calendar, badge: appointmentsToday },
    { label: 'Menu',      icon: Menu, action: 'open-menu' },
  ];

  // Descobre qual item está ativo baseado no pathname
  const activeIndex = (() => {
    const idx = items.findIndex(
      (it) => it.href && (pathname === it.href || pathname.startsWith(it.href + '/'))
    );
    return idx === -1 ? 0 : idx;
  })();

  const handleClick = (item: NavItem) => {
    if (item.action === 'open-menu') {
      onOpenMenu();
      return;
    }
    if (item.href) router.push(item.href);
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 flex justify-center px-4 md:hidden pointer-events-none"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <nav
        className="pointer-events-auto relative w-full max-w-[420px] h-[68px] rounded-2xl bg-card border border-border shadow-[0_10px_30px_rgba(0,0,0,0.3)]"
        aria-label="Navegação inferior"
      >
        {/* Indicador circular que desliza */}
        <div
          className="absolute top-[-22px] h-[68px] rounded-full bg-primary border-[6px] border-background transition-transform duration-[400ms] ease-out shadow-lg"
          style={{
            width: `${100 / items.length}%`,
            left: 0,
            transform: `translateX(${activeIndex * 100}%)`,
          }}
          aria-hidden="true"
        />

        <ul className="relative z-10 flex w-full h-full">
          {items.map((item, index) => {
            const isActive = index === activeIndex;
            const Icon = item.icon;
            const badgeValue = item.badge ?? 0;
            const showBadge = !isActive && badgeValue > 0;

            return (
              <li key={item.label} className="flex-1 flex items-center justify-center">
                <button
                  onClick={() => handleClick(item)}
                  className="relative flex flex-col items-center justify-center w-full h-full group"
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon
                    className={cn(
                      'transition-all duration-300',
                      isActive
                        ? 'h-6 w-6 -translate-y-[26px] text-primary-foreground'
                        : 'h-5 w-5 text-muted-foreground group-hover:text-foreground'
                    )}
                  />
                  <span
                    className={cn(
                      'absolute text-[10px] font-medium transition-all duration-300',
                      isActive
                        ? 'opacity-100 translate-y-[12px] text-foreground'
                        : 'opacity-0 translate-y-[20px]'
                    )}
                  >
                    {item.label}
                  </span>

                  {showBadge ? (
                    <span className="absolute top-2 right-[22%] flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground ring-2 ring-card">
                      {badgeValue > 99 ? '99+' : badgeValue}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

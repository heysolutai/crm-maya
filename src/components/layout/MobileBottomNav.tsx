'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  MoreHorizontal,
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
 * Bottom nav flat: 5 items com labels visiveis e circulo roxo centralizado
 * ao redor do icone ativo.
 */
export function MobileBottomNav({
  unreadCount = 0,
  appointmentsToday = 0,
  onOpenMenu,
}: MobileBottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  const items: NavItem[] = [
    { label: 'Home',      href: '/app/dashboard',     icon: LayoutDashboard },
    { label: 'Conversas', href: '/app/conversations', icon: MessageSquare, badge: unreadCount },
    { label: 'Leads',     href: '/app/clients',       icon: Users },
    { label: 'Mais',      icon: MoreHorizontal, action: 'open-menu' },
  ];

  const isItemActive = (item: NavItem) => {
    if (!item.href) return false;
    return pathname === item.href || pathname.startsWith(item.href + '/');
  };

  const handleClick = (item: NavItem) => {
    if (item.action === 'open-menu') {
      onOpenMenu();
      return;
    }
    if (item.href) router.push(item.href);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-card/95 backdrop-blur-md border-t border-border"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Navegação inferior"
    >
      <ul className="flex items-stretch h-[64px] px-1">
        {items.map((item) => {
          const active = isItemActive(item);
          const Icon = item.icon;
          const badgeValue = item.badge ?? 0;
          const showBadge = !active && badgeValue > 0;

          return (
            <li key={item.label} className="flex-1">
              <button
                onClick={() => handleClick(item)}
                className="flex flex-col items-center justify-center gap-1 w-full h-full group"
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
              >
                {/* Container fixo para alinhar verticalmente todos os icones */}
                <div className="relative h-9 w-9 flex items-center justify-center">
                  {/* Circulo roxo atras do icone ativo */}
                  <div
                    className={cn(
                      'absolute inset-0 rounded-full transition-all duration-200',
                      active
                        ? 'bg-primary scale-100 opacity-100 shadow-[0_4px_12px_hsl(var(--primary)/0.35)]'
                        : 'scale-0 opacity-0'
                    )}
                    aria-hidden="true"
                  />
                  <Icon
                    className={cn(
                      'relative transition-colors',
                      active
                        ? 'h-[19px] w-[19px] text-white'
                        : 'h-[22px] w-[22px] text-muted-foreground group-hover:text-foreground'
                    )}
                  />

                  {showBadge ? (
                    <span className="absolute -top-0.5 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground ring-2 ring-card">
                      {badgeValue > 99 ? '99+' : badgeValue}
                    </span>
                  ) : null}
                </div>

                <span
                  className={cn(
                    'text-[10px] leading-none transition-colors',
                    active
                      ? 'text-primary font-semibold'
                      : 'text-muted-foreground font-medium group-hover:text-foreground'
                  )}
                >
                  {item.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

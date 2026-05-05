import { type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface StatItem {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color?: 'green' | 'blue' | 'yellow' | 'red' | 'purple' | 'cyan';
  subtitle?: string;
}

const colorMap = {
  green: 'bg-brand-primary/10 text-brand-primary',
  blue: 'bg-brand-deep/10 text-brand-deep',
  yellow: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  red: 'bg-red-500/10 text-red-600 dark:text-red-400',
  purple: 'bg-primary/10 text-primary',
  cyan: 'bg-brand-light/10 text-brand-light',
};

interface StatCardsProps {
  items: StatItem[];
  loading?: boolean;
}

export function StatCards({ items, loading }: StatCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: items.length || 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-6 w-12" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((item) => {
        const Icon = item.icon;
        const colors = colorMap[item.color || 'blue'];
        return (
          <Card key={item.label} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={cn('rounded-lg p-2.5 shrink-0', colors)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{item.label}</p>
                  <p className="text-xl font-bold tracking-tight">{item.value}</p>
                  {item.subtitle && (
                    <p className="text-[11px] text-muted-foreground truncate">{item.subtitle}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

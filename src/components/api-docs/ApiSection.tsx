import { ReactNode, ComponentType } from 'react';

interface ApiSectionProps {
  id: string;
  title: string;
  description: string;
  icon?: ComponentType<{ className?: string }>;
  badge?: string;
  children: ReactNode;
}

export function ApiSection({ id, title, description, icon: Icon, badge, children }: ApiSectionProps) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <div>
        <div className="flex items-center gap-3 mb-2">
          {Icon && (
            <div className="h-9 w-9 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center">
              <Icon className="h-5 w-5 text-red-400" />
            </div>
          )}
          <h2 className="text-2xl font-bold">{title}</h2>
          {badge && (
            <span className="text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              {badge}
            </span>
          )}
        </div>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-2">
        {children}
      </div>
    </section>
  );
}

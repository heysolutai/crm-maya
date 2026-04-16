import { memo, useState, useMemo } from 'react';
import { ChevronDown, SlidersHorizontal, Building2, Users, MessageCircle, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Conversation } from './types';

interface Department {
  id: string;
  name: string;
  color: string;
}

interface ConversationFiltersProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversations: Conversation[] | undefined;
  departments: Department[];
  queueCounts: Record<string, number>;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  departmentFilter: string;
  onDepartmentFilterChange: (value: string) => void;
}

type SectionKey = 'status' | 'department' | 'queue' | 'channel';

const STATUS_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'unread',      label: 'Não lidas',  color: '#ef4444' },
  { value: 'active',      label: 'Ativas',     color: '#10b981' },
  { value: 'waiting',     label: 'Pendentes',  color: '#f59e0b' },
  { value: 'closed',      label: 'Resolvidas', color: '#6b7280' },
  { value: 'transferred', label: 'Transferidas', color: '#8b5cf6' },
];

const CHANNEL_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp', color: '#25d366' },
];

export const ConversationFilters = memo(function ConversationFilters({
  open,
  onOpenChange,
  conversations,
  departments,
  queueCounts,
  statusFilter,
  onStatusFilterChange,
  departmentFilter,
  onDepartmentFilterChange,
}: ConversationFiltersProps) {
  const [sections, setSections] = useState<Record<SectionKey, boolean>>({
    status: true,
    department: true,
    queue: false,
    channel: false,
  });

  // Contagens derivadas de conversations
  const counts = useMemo(() => {
    const all = conversations || [];
    const byStatus: Record<string, number> = {};
    const byDept: Record<string, number> = {};
    let channelWhatsapp = 0;
    let queueTotal = 0;

    for (const c of all) {
      const s = (c as any).status || 'active';
      byStatus[s] = (byStatus[s] || 0) + 1;

      if (((c as any).unread_count || 0) > 0) {
        byStatus['unread'] = (byStatus['unread'] || 0) + 1;
      }

      const deptId = (c as any).department_id || (c as any).departmentId;
      if (deptId) byDept[deptId] = (byDept[deptId] || 0) + 1;

      const ch = (c as any).channel || 'whatsapp';
      if (ch === 'whatsapp') channelWhatsapp++;
    }

    for (const dept of departments) {
      queueTotal += queueCounts[dept.id] || 0;
    }

    return { byStatus, byDept, channelWhatsapp, queueTotal };
  }, [conversations, departments, queueCounts]);

  // Conta filtros ativos (considerando "all" como sem filtro)
  const activeCount =
    (statusFilter && statusFilter !== 'all' ? 1 : 0) +
    (departmentFilter && departmentFilter !== 'all' ? 1 : 0);

  const toggle = (key: SectionKey) =>
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleSelectStatus = (value: string) => {
    onStatusFilterChange(statusFilter === value ? 'all' : value);
  };

  const handleSelectDept = (value: string) => {
    onDepartmentFilterChange(departmentFilter === value ? 'all' : value);
  };

  const clearAll = () => {
    onStatusFilterChange('all');
    onDepartmentFilterChange('all');
  };

  return (
    <div className="border border-border rounded-md bg-card/50">
      {/* Header: FILTROS [N] com toggle */}
      <button
        onClick={() => onOpenChange(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-accent/40 transition-colors rounded-t-md"
      >
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Filtros
          </span>
          {activeCount > 0 && (
            <Badge className="h-4 min-w-4 px-1.5 text-[10px] bg-primary text-primary-foreground">
              {activeCount}
            </Badge>
          )}
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div className="px-2 pb-2 space-y-1.5">
          <FilterSection
            label="Status"
            icon={<Activity className="h-3.5 w-3.5" />}
            open={sections.status}
            onToggle={() => toggle('status')}
          >
            {STATUS_OPTIONS.map((opt) => (
              <FilterItem
                key={opt.value}
                checked={statusFilter === opt.value}
                color={opt.color}
                label={opt.label}
                count={counts.byStatus[opt.value] || 0}
                onClick={() => handleSelectStatus(opt.value)}
              />
            ))}
          </FilterSection>

          <FilterSection
            label="Departamento"
            icon={<Building2 className="h-3.5 w-3.5" />}
            open={sections.department}
            onToggle={() => toggle('department')}
          >
            {departments.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum departamento</p>
            ) : (
              departments.map((dept) => (
                <FilterItem
                  key={dept.id}
                  checked={departmentFilter === dept.id}
                  color={dept.color}
                  label={dept.name}
                  count={counts.byDept[dept.id] || 0}
                  onClick={() => handleSelectDept(dept.id)}
                />
              ))
            )}
          </FilterSection>

          <FilterSection
            label="Fila de atendimento"
            icon={<Users className="h-3.5 w-3.5" />}
            open={sections.queue}
            onToggle={() => toggle('queue')}
          >
            {departments.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">Nenhuma fila ativa</p>
            ) : (
              departments.map((dept) => {
                const count = queueCounts[dept.id] || 0;
                if (count === 0) return null;
                return (
                  <div
                    key={`queue-${dept.id}`}
                    className="flex items-center justify-between px-3 py-1.5 text-[13px]"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: dept.color }}
                      />
                      <span className="text-foreground/80">{dept.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{count}</span>
                  </div>
                );
              })
            )}
          </FilterSection>

          <FilterSection
            label="Canal"
            icon={<MessageCircle className="h-3.5 w-3.5" />}
            open={sections.channel}
            onToggle={() => toggle('channel')}
          >
            {CHANNEL_OPTIONS.map((opt) => (
              <FilterItem
                key={opt.value}
                checked={false}
                color={opt.color}
                label={opt.label}
                count={counts.channelWhatsapp}
                onClick={() => {}}
                disabled
              />
            ))}
          </FilterSection>

          <div className="flex items-center gap-2 pt-2 px-1">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-8 text-xs"
              onClick={clearAll}
              disabled={activeCount === 0}
            >
              Limpar tudo
            </Button>
            <Button
              size="sm"
              className="flex-1 h-8 text-xs"
              onClick={() => onOpenChange(false)}
            >
              Aplicar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});

// ── Subcomponents ──────────────────────────────

interface FilterSectionProps {
  label: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function FilterSection({ label, icon, open, onToggle, children }: FilterSectionProps) {
  return (
    <div className="border border-border/60 rounded-md overflow-hidden bg-background/40">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-accent/40 transition-colors"
      >
        <div className="flex items-center gap-2 text-[12px] font-medium text-foreground/90">
          {icon}
          {label}
        </div>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-muted-foreground transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>
      {open && <div className="border-t border-border/60 py-1">{children}</div>}
    </div>
  );
}

interface FilterItemProps {
  checked: boolean;
  color: string;
  label: string;
  count: number;
  onClick: () => void;
  disabled?: boolean;
}

function FilterItem({ checked, color, label, count, onClick, disabled }: FilterItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-1.5 text-[13px] transition-colors',
        'hover:bg-accent/40 disabled:opacity-50 disabled:cursor-not-allowed',
        checked && 'bg-primary/10'
      )}
    >
      <span
        className={cn(
          'h-3.5 w-3.5 rounded-sm border flex items-center justify-center shrink-0',
          checked ? 'bg-primary border-primary' : 'border-muted-foreground/40'
        )}
      >
        {checked && (
          <svg className="h-2.5 w-2.5 text-primary-foreground" viewBox="0 0 12 12" fill="none">
            <path
              d="M2.5 6L5 8.5L9.5 3.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="flex-1 text-left text-foreground/90 truncate">{label}</span>
      <span className="text-[11px] text-muted-foreground tabular-nums">{count}</span>
    </button>
  );
}

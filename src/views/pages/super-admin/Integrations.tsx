'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAdminIntegrations } from '@/components/super-admin/integrations/hooks';
import { segmentLabel, type AdminIntegration } from '@/components/super-admin/integrations/types';
import { cn } from '@/lib/utils';
import { AlertTriangle, Building2, Loader2, Plug, Plus, Wrench } from 'lucide-react';

function IntegrationCard({ integration }: { integration: AdminIntegration }) {
  const semCredencial = Object.keys(integration.headers).length === 0;
  const ativas = integration.tools.filter((t) => t.isActive).length;

  return (
    <Link
      href={`/super-admin/integrations/${integration.id}`}
      className={cn(
        'group flex flex-col gap-4 rounded-2xl border border-border/40 bg-card/60 p-5 backdrop-blur-sm transition-colors hover:border-primary/40 hover:bg-card',
        !integration.isActive && 'opacity-70'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-muted text-2xl">
          {integration.icon || '🔌'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold group-hover:text-primary">{integration.name}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{integration.slug}</p>
        </div>
        <Badge variant={integration.isActive ? 'default' : 'secondary'} className="shrink-0">
          {integration.isActive ? 'Ativa' : 'Inativa'}
        </Badge>
      </div>

      {integration.description && (
        <p className="line-clamp-2 text-sm text-muted-foreground">{integration.description}</p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">{segmentLabel(integration.segment)}</Badge>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Wrench className="h-3.5 w-3.5" />
          {integration.tools.length} {integration.tools.length === 1 ? 'ferramenta' : 'ferramentas'}
          {ativas !== integration.tools.length && ` (${ativas} ativas)`}
        </span>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" />
          {integration.companiesUsing} {integration.companiesUsing === 1 ? 'restaurante' : 'restaurantes'}
        </span>
      </div>

      {semCredencial && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Credencial pendente: nenhum cabeçalho configurado
        </div>
      )}
    </Link>
  );
}

export default function Integrations() {
  const { data, isLoading, error, refetch } = useAdminIntegrations();
  const integrations = data?.integrations ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Integrações da IA</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Sistemas externos que a IA pode usar (reservas, agenda, pedidos). Monte aqui, uma vez por sistema, as
            ferramentas e credenciais; os restaurantes só ativam e escolhem o que ligar.
          </p>
        </div>
        <Button asChild>
          <Link href="/super-admin/integrations/new">
            <Plus className="mr-2 h-4 w-4" />
            Nova integração
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/40 bg-card/60 p-10 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'Não foi possível carregar as integrações.'}
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : integrations.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/60 p-10 text-center">
          <Plug className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium">Nenhuma integração</p>
          <p className="text-sm text-muted-foreground">Crie a primeira para a IA poder agir em um sistema externo.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {integrations.map((i) => (
            <IntegrationCard key={i.id} integration={i} />
          ))}
        </div>
      )}
    </div>
  );
}

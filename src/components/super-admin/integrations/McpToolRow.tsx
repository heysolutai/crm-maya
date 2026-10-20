'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useUpdateMcpTool } from './hooks';
import type { AdminTool } from './types';

interface Props {
  integrationId: string;
  tool: AdminTool;
  isTestTool: boolean;
}

/**
 * Uma ferramenta de servidor MCP no catálogo. O que ela faz e os parâmetros
 * vêm do servidor; aqui só o que é do CRM, salvando na hora: o nome que o
 * restaurante vê, se muda dados (a IA confirma com o cliente antes) e se está ativa.
 */
export function McpToolRow({ integrationId, tool, isTestTool }: Props) {
  const { toast } = useToast();
  const salvar = useUpdateMcpTool(integrationId);
  const [label, setLabel] = useState(tool.label);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => setLabel(tool.label), [tool.label]);

  const gravar = (patch: { label?: string; isWrite?: boolean; isActive?: boolean }) =>
    salvar.mutate(
      { toolId: tool.id, patch },
      {
        onSuccess: () => {
          setSalvo(true);
          window.setTimeout(() => setSalvo(false), 1500);
        },
        onError: (e) => {
          setLabel(tool.label);
          toast({ title: 'Erro ao salvar', description: e instanceof Error ? e.message : 'Tente novamente', variant: 'destructive' });
        },
      }
    );

  const salvarNome = () => {
    const novo = label.trim();
    if (!novo) {
      setLabel(tool.label);
      return;
    }
    if (novo !== tool.label) gravar({ label: novo });
  };

  const idBase = `mcp-${tool.id}`;

  return (
    <div className={cn('space-y-2 p-3', !tool.isActive && 'opacity-60')}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value.slice(0, 120))}
          onBlur={salvarNome}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="h-8 max-w-xs font-medium"
          aria-label="Nome que o restaurante vê"
        />
        <span className="font-mono text-xs text-muted-foreground">{tool.name}</span>
        {salvar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        {salvo && !salvar.isPending && <Check className="h-3.5 w-3.5 text-emerald-600" />}
        {!tool.isActive && (
          <Badge variant="secondary" className="text-[10px]">
            desativada
          </Badge>
        )}
        {isTestTool && (
          <Badge variant="outline" className="text-[10px]">
            teste do restaurante
          </Badge>
        )}
      </div>

      {tool.aiDescription && <p className="line-clamp-2 text-xs text-muted-foreground">{tool.aiDescription}</p>}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <span className="font-mono text-muted-foreground">servidor: {tool.path}</span>
        <div className="flex items-center gap-2">
          <Switch
            id={`${idBase}-write`}
            checked={tool.isWrite}
            disabled={salvar.isPending}
            onCheckedChange={(v) => gravar({ isWrite: v })}
          />
          <Label htmlFor={`${idBase}-write`} className="text-xs font-normal">
            Muda dados (a IA confirma com o cliente antes)
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id={`${idBase}-ativa`}
            checked={tool.isActive}
            disabled={salvar.isPending}
            onCheckedChange={(v) => gravar({ isActive: v })}
          />
          <Label htmlFor={`${idBase}-ativa`} className="text-xs font-normal">
            Ativa
          </Label>
        </div>
        <span className="text-muted-foreground">
          · {tool.companiesUsing} {tool.companiesUsing === 1 ? 'restaurante' : 'restaurantes'}
        </span>
      </div>
    </div>
  );
}

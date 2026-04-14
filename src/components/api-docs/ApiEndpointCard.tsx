'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CodeBlock } from './CodeBlock';
import { ParameterTable } from './ParameterTable';
import { Lock, Globe, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Parameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface ErrorCode {
  code: string;
  status: number;
  message: string;
}

interface ApiEndpointCardProps {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  name: string;
  description: string;
  authentication: 'bearer' | 'webhook-token' | 'api-key' | 'none';
  pathParameters?: Parameter[];
  queryParameters?: Parameter[];
  bodyParameters?: Parameter[];
  exampleRequest: string;
  exampleResponse: string;
  errors?: ErrorCode[];
}

const methodStyles: Record<string, string> = {
  GET: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  POST: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  PUT: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  PATCH: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  DELETE: 'bg-red-500/15 text-red-400 border-red-500/30',
};

export function ApiEndpointCard({
  method,
  path,
  name,
  description,
  authentication,
  pathParameters = [],
  queryParameters = [],
  bodyParameters = [],
  exampleRequest,
  exampleResponse,
  errors = [],
}: ApiEndpointCardProps) {
  const [open, setOpen] = useState(false);
  const anchorId = `ep-${method.toLowerCase()}-${path.replace(/[^a-z0-9]/gi, '-').replace(/^-+|-+$/g, '')}`;

  return (
    <div
      id={anchorId}
      className="scroll-mt-24 rounded-lg border border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden hover:border-border transition-colors"
    >
      {/* Header colapsável (sempre visível) */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/30 transition-colors"
      >
        <Badge
          className={cn(
            'font-mono text-xs px-2 py-0.5 border shrink-0 w-14 justify-center',
            methodStyles[method]
          )}
        >
          {method}
        </Badge>
        <code className="text-sm font-mono text-foreground/90 truncate">{path}</code>
        <span className="ml-auto text-sm text-muted-foreground truncate pl-2 hidden sm:inline">
          {name}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground shrink-0 transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>

      {/* Conteúdo expandido */}
      {open && (
        <div className="px-4 pb-6 pt-2 space-y-6 border-t border-border/50">
          <div className="pt-4">
            <h3 className="text-lg font-semibold text-foreground">{name}</h3>
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
            <div className="flex items-center gap-2 mt-3">
              {authentication === 'bearer' && (
                <Badge variant="outline" className="flex items-center gap-1 text-xs">
                  <Lock className="h-3 w-3" />
                  Bearer Token
                </Badge>
              )}
              {authentication === 'api-key' && (
                <Badge variant="outline" className="flex items-center gap-1 text-xs">
                  <Lock className="h-3 w-3" />
                  API Key
                </Badge>
              )}
              {authentication === 'webhook-token' && (
                <Badge variant="outline" className="flex items-center gap-1 text-xs">
                  <Lock className="h-3 w-3" />
                  Webhook Token
                </Badge>
              )}
              {authentication === 'none' && (
                <Badge variant="outline" className="flex items-center gap-1 text-xs">
                  <Globe className="h-3 w-3" />
                  Público
                </Badge>
              )}
            </div>
          </div>

          {pathParameters.length > 0 && (
            <ParameterTable parameters={pathParameters} title="Path Parameters" />
          )}
          {queryParameters.length > 0 && (
            <ParameterTable parameters={queryParameters} title="Query Parameters" />
          )}
          {bodyParameters.length > 0 && (
            <ParameterTable parameters={bodyParameters} title="Body Parameters" />
          )}

          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Exemplos</h4>
            <Tabs defaultValue="request" className="w-full">
              <TabsList>
                <TabsTrigger value="request">Request</TabsTrigger>
                <TabsTrigger value="response">Response</TabsTrigger>
              </TabsList>
              <TabsContent value="request">
                <CodeBlock code={exampleRequest} language="typescript" />
              </TabsContent>
              <TabsContent value="response">
                <CodeBlock code={exampleResponse} language="json" />
              </TabsContent>
            </Tabs>
          </div>

          {errors.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Códigos de Erro</h4>
              <div className="space-y-2">
                {errors.map((error) => (
                  <div
                    key={error.code}
                    className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg"
                  >
                    <Badge variant="destructive">{error.status}</Badge>
                    <div>
                      <code className="text-sm font-mono">{error.code}</code>
                      <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CodeBlock } from './CodeBlock';
import { ParameterTable } from './ParameterTable';
import { Lock, Globe } from 'lucide-react';

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

const methodColors = {
  GET: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  POST: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  PUT: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  PATCH: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  DELETE: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
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
  return (
    <Card id={path.replace('/', '')} className="scroll-mt-20">
      <CardHeader>
        <div className="flex items-center gap-3 mb-2">
          <Badge className={methodColors[method]}>{method}</Badge>
          <code className="text-sm font-mono bg-muted px-2 py-1 rounded">{path}</code>
        </div>
        <CardTitle>{name}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <div className="flex items-center gap-2 mt-2">
          {authentication === 'bearer' && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Bearer Token
            </Badge>
          )}
          {authentication === 'api-key' && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Lock className="h-3 w-3" />
              API Key
            </Badge>
          )}
          {authentication === 'webhook-token' && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Webhook Token
            </Badge>
          )}
          {authentication === 'none' && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Globe className="h-3 w-3" />
              Público
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
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
                <div key={error.code} className="flex items-start gap-2 p-3 bg-muted rounded-lg">
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
      </CardContent>
    </Card>
  );
}

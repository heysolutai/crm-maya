import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign, Zap, Activity, TrendingUp } from 'lucide-react';
import { useTokenUsage } from '@/hooks/useTokenUsage';
import { getModelLabel } from '@/lib/aiModels';
import { getModelPricing } from '@/lib/aiPricing';
import { 
  LineChart, 
  Line, 
  BarChart,
  Bar,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function TokenDashboard() {
  const { data: tokenData, isLoading } = useTokenUsage(30);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const formatCost = (cost: number) => `$${cost.toFixed(4)}`;
  const formatTokens = (tokens: number) => 
    tokens > 1000 ? `${(tokens / 1000).toFixed(1)}K` : tokens.toString();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard de Custos de IA</h1>
        <p className="text-muted-foreground">
          Análise de uso de tokens e custos dos últimos 30 dias
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Custo Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCost(tokenData?.totalCost || 0)}
            </div>
            <p className="text-xs text-muted-foreground">Últimos 30 dias</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tokens Usados</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatTokens(tokenData?.totalTokens || 0)}
            </div>
            <p className="text-xs text-muted-foreground">Input + Output</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Requisições</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tokenData?.totalRequests || 0}</div>
            <p className="text-xs text-muted-foreground">Chamadas de IA</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Custo Médio</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCost(
                (tokenData?.totalCost || 0) / (tokenData?.totalRequests || 1)
              )}
            </div>
            <p className="text-xs text-muted-foreground">Por requisição</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Custo por Dia */}
        <Card>
          <CardHeader>
            <CardTitle>Evolução de Custos</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={tokenData?.dailyUsage || []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }} 
                  className="text-muted-foreground"
                />
                <YAxis 
                  tickFormatter={(value) => `$${value.toFixed(2)}`}
                  className="text-muted-foreground"
                />
                <Tooltip 
                  formatter={(value: number) => [`$${value.toFixed(4)}`, 'Custo']}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '0.5rem'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="cost" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2} 
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Tokens por Dia */}
        <Card>
          <CardHeader>
            <CardTitle>Uso de Tokens Diário</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={tokenData?.dailyUsage || []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis 
                  tickFormatter={formatTokens}
                  className="text-muted-foreground"
                />
                <Tooltip 
                  formatter={(value: number) => [formatTokens(value), 'Tokens']}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '0.5rem'
                  }}
                />
                <Bar dataKey="tokens" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Análise por Empresa */}
      <Card>
        <CardHeader>
          <CardTitle>Custos por Empresa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {tokenData?.byCompany.map((company, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <h4 className="font-semibold">{company.companyName}</h4>
                  <p className="text-sm text-muted-foreground">
                    {company.requests} requisições • {formatTokens(company.totalTokens)} tokens
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold">{formatCost(company.totalCost)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCost(company.totalCost / company.requests)}/req
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Comparação de Modelos */}
      <Card>
        <CardHeader>
          <CardTitle>Análise por Modelo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {tokenData?.byModel.map((model, idx) => {
              const pricing = getModelPricing(model.model);
              const costPerMillionTokens = pricing 
                ? (pricing.inputPer1M + pricing.outputPer1M) / 2
                : 0;

              return (
                <div key={idx} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <h4 className="font-semibold">{getModelLabel(model.model)}</h4>
                    <p className="text-sm text-muted-foreground">
                      {model.requests} requisições • {formatTokens(model.totalTokens)} tokens
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Média: {formatTokens(model.avgTokensPerRequest)} tokens/req
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold">{formatCost(model.totalCost)}</p>
                    <p className="text-xs text-muted-foreground">
                      ~${costPerMillionTokens.toFixed(2)}/1M tokens
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

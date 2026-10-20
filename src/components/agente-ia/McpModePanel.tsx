'use client';

import { useState } from 'react';
import { AlertTriangle, Eye, EyeOff, Loader2, Plug, RefreshCw, Server, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AbilityRow, AmberHint } from '@/components/integrations/AbilityRow';
import type { NativeToolState } from '@/components/integrations/types';
import { useSaveNativeTools } from '@/components/integrations/useIntegrations';
import { useToolMode, type EstiloChave, type ToolModeState } from './useToolMode';

const ESTILOS: { value: EstiloChave; label: string }[] = [
  { value: 'bearer', label: 'Authorization: Bearer (o mais comum)' },
  { value: 'x-api-key', label: 'Cabeçalho x-api-key' },
  { value: 'apikey', label: 'Cabeçalho apikey' },
];

interface Props {
  agentId: string;
  estado: ToolModeState;
  canEdit: boolean;
  /** Ferramentas nativas (pra chave "Transferir para um atendente"). */
  native: NativeToolState[];
}

/**
 * Modo "Servidor MCP" do WhatsApp: cola o endereço do servidor MCP do
 * sistema do restaurante (e a chave), o CRM busca as ferramentas dele e a IA
 * usa conforme a conversa. Tudo salva na hora.
 */
export function McpModePanel({ agentId, estado, canEdit, native }: Props) {
  const { conectar, desconectar, ligarFerramentas } = useToolMode(agentId);
  const saveNative = useSaveNativeTools();
  const conexao = estado.conexao;

  const [editando, setEditando] = useState(!conexao);
  const [endereco, setEndereco] = useState(conexao?.endereco ?? 'https://');
  const [chave, setChave] = useState('');
  const [verChave, setVerChave] = useState(false);
  const [estilo, setEstilo] = useState<EstiloChave>('bearer');
  const [confirmarDesconectar, setConfirmarDesconectar] = useState(false);

  const enderecoOk = /^https:\/\/[^\s/]+\.[^\s]+/.test(endereco.trim());

  const enviarConexao = (dados: { endereco: string; chave?: string }) =>
    conectar.mutate(
      { ...dados, estilo },
      {
        onSuccess: (s) => {
          setEditando(false);
          setChave('');
          toast.success(
            s.ferramentas.length
              ? `Conectado: ${s.ferramentas.length} ${s.ferramentas.length === 1 ? 'ferramenta encontrada' : 'ferramentas encontradas'}.`
              : 'Conectado, mas o servidor não tem nenhuma ferramenta.'
          );
        },
        onError: (e) => toast.error(e.message, { duration: 8000 }),
      }
    );

  const alternarFerramenta = (nome: string, ligar: boolean) => {
    const atuais = estado.ferramentas.filter((f) => f.ligada).map((f) => f.name);
    const proximas = ligar ? [...new Set([...atuais, nome])] : atuais.filter((n) => n !== nome);
    ligarFerramentas.mutate(proximas, {
      onSuccess: () => toast.success('Salvo', { duration: 1500 }),
      onError: (e) => toast.error(e.message),
    });
  };

  const transferir = native.find((t) => t.name === 'transferir_para_humano');
  const alternarTransferir = (ligar: boolean) => {
    const proxima = native.filter((t) => (t.name === 'transferir_para_humano' ? ligar : t.enabled)).map((t) => t.name);
    saveNative.mutate(proxima, {
      onSuccess: () => toast.success('Salvo', { duration: 1500 }),
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.'),
    });
  };

  return (
    <div className="space-y-6">
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Server className="h-5 w-5 text-primary" />
            Servidor MCP
          </CardTitle>
          <CardDescription>
            Conecte o sistema de vocês: a IA usa as ferramentas dele sozinha, conforme o que o cliente pede.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {estado.problemaRecente && (
            <div role="alert" className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p className="flex items-start gap-1.5 font-medium text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {estado.problemaRecente.titulo}
              </p>
              <p>{estado.problemaRecente.motivo}</p>
              {estado.problemaRecente.oQueFazer && (
                <p>
                  <span className="font-medium">O que fazer: </span>
                  {estado.problemaRecente.oQueFazer}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {estado.problemaRecente.vezes === 1 ? '1 vez' : `${estado.problemaRecente.vezes} vezes`} nas últimas 24h · última{' '}
                {estado.problemaRecente.quando}
              </p>
            </div>
          )}

          {conexao && !editando ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="flex min-w-0 items-center gap-1.5 text-sm">
                <Plug className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="truncate font-mono text-xs">{conexao.endereco}</span>
              </span>
              <Badge variant="secondary" className="text-[10px]">
                {conexao.temChave ? 'chave cadastrada' : 'sem chave'}
              </Badge>
              {canEdit && (
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={conectar.isPending}
                    onClick={() => enviarConexao({ endereco: conexao.endereco })}
                  >
                    {conectar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Buscar ferramentas de novo
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditando(true)}>
                    Alterar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setConfirmarDesconectar(true)}
                  >
                    <Unplug className="mr-2 h-4 w-4" />
                    Desconectar
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor={`mcp-url-${agentId}`}>Endereço do servidor MCP</Label>
                <Input
                  id={`mcp-url-${agentId}`}
                  value={endereco}
                  disabled={!canEdit}
                  onChange={(e) => setEndereco(e.target.value)}
                  placeholder="https://mcp.seusistema.com/mcp"
                  className="font-mono"
                  spellCheck={false}
                />
                <p className="text-xs text-muted-foreground">Quem fez o sistema de vocês passa esse endereço (https).</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`mcp-chave-${agentId}`}>Chave de acesso</Label>
                  <div className="flex gap-2">
                    <Input
                      id={`mcp-chave-${agentId}`}
                      type={verChave ? 'text' : 'password'}
                      value={chave}
                      disabled={!canEdit}
                      onChange={(e) => setChave(e.target.value)}
                      placeholder={conexao?.temChave ? 'Em branco = mantém a chave salva' : 'Se o servidor pedir'}
                      className="font-mono"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      onClick={() => setVerChave((v) => !v)}
                      title={verChave ? 'Esconder' : 'Mostrar'}
                    >
                      {verChave ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Como a chave é enviada</Label>
                  <Select value={estilo} onValueChange={(v) => setEstilo(v as EstiloChave)} disabled={!canEdit}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ESTILOS.map((e) => (
                        <SelectItem key={e.value} value={e.value}>
                          {e.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={!enderecoOk || conectar.isPending}
                    onClick={() => enviarConexao({ endereco: endereco.trim(), ...(chave.trim() ? { chave: chave.trim() } : {}) })}
                  >
                    {conectar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plug className="mr-2 h-4 w-4" />}
                    {conectar.isPending ? 'Conectando...' : 'Conectar e buscar ferramentas'}
                  </Button>
                  {conexao && (
                    <Button variant="ghost" onClick={() => setEditando(false)}>
                      Cancelar
                    </Button>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">A chave fica guardada criptografada e não aparece de novo.</p>
            </div>
          )}
        </CardContent>

        {conexao && (
          <CardContent className="divide-y border-t p-0">
            {estado.ferramentas.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground sm:px-6">
                O servidor não tem nenhuma ferramenta. Clique em &quot;Buscar ferramentas de novo&quot; depois que o sistema de vocês
                publicar.
              </p>
            ) : (
              estado.ferramentas.map((f) => (
                <AbilityRow
                  key={f.name}
                  id={`mcp-tool-${f.name}`}
                  label={f.label}
                  help={f.description.length > 220 ? `${f.description.slice(0, 220)}…` : f.description}
                  checked={f.ligada}
                  disabled={!canEdit || ligarFerramentas.isPending}
                  onChange={(v) => alternarFerramenta(f.name, v)}
                >
                  {f.isWrite && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">Muda dados: a IA confirma com o cliente antes.</p>
                  )}
                </AbilityRow>
              ))
            )}
          </CardContent>
        )}
      </Card>

      {transferir && (
        <Card>
          <CardContent className="p-0">
            <AbilityRow
              id="mcp-transferir"
              label={transferir.label}
              help="Continua valendo no modo Servidor MCP: a IA passa a conversa para a equipe quando precisar."
              checked={transferir.enabled}
              disabled={!canEdit}
              onChange={alternarTransferir}
            >
              {!transferir.enabled && <AmberHint>Recomendado deixar ligado.</AmberHint>}
            </AbilityRow>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmarDesconectar}
        onOpenChange={setConfirmarDesconectar}
        title="Desconectar o servidor MCP?"
        description="A IA deixa de usar as ferramentas desse servidor neste WhatsApp e volta para as ferramentas do CRM (function calls). Dá para conectar de novo depois."
        confirmLabel="Desconectar"
        variant="destructive"
        isLoading={desconectar.isPending}
        onConfirm={async () => {
          try {
            await desconectar.mutateAsync();
            toast.success('Servidor MCP desconectado.');
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Não foi possível desconectar.');
          } finally {
            setConfirmarDesconectar(false);
          }
        }}
      />
    </div>
  );
}

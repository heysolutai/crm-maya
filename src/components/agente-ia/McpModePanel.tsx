'use client';

import { useState } from 'react';
import { AlertTriangle, Eye, EyeOff, Loader2, Plug, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AbilityRow } from '@/components/integrations/AbilityRow';
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
  /** Servidor MCP ligado neste WhatsApp. Desligado = só para ver: tudo apagado, sem mexer. */
  ativo: boolean;
}

/**
 * Conteúdo do bloco "Servidor MCP": sem servidor, o formulário para conectar;
 * conectado, o endereço e as ferramentas dele. Tudo salva na hora.
 */
export function McpModePanel({ agentId, estado, canEdit, ativo }: Props) {
  const { conectar, desconectar, ligarFerramentas } = useToolMode(agentId);
  const conexao = estado.conexao;

  const [editando, setEditando] = useState(!conexao);
  const [endereco, setEndereco] = useState(conexao?.endereco ?? 'https://');
  const [chave, setChave] = useState('');
  const [verChave, setVerChave] = useState(false);
  const [estilo, setEstilo] = useState<EstiloChave>('bearer');
  const [confirmarDesconectar, setConfirmarDesconectar] = useState(false);

  const enderecoOk = /^https:\/\/[^\s/]+\.[^\s]+/.test(endereco.trim());

  const enviarConexao = () =>
    conectar.mutate(
      { endereco: endereco.trim(), ...(chave.trim() ? { chave: chave.trim() } : {}), estilo },
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

  return (
    <div className="divide-y">
      <div className="space-y-3 px-4 py-3 sm:px-6">
        {ativo && estado.problemaRecente && (
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

        {!ativo ? (
          <p className="text-sm text-muted-foreground">
            {conexao ? (
              <>
                Servidor: <span className="font-mono text-xs">{conexao.endereco}</span>. Ligue o Servidor MCP para usar ou
                alterar.
              </>
            ) : (
              'Nenhum servidor conectado. Ligue o Servidor MCP para conectar.'
            )}
          </p>
        ) : conexao && !editando ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="flex min-w-0 items-center gap-1.5 text-sm">
              <Plug className="h-4 w-4 shrink-0 text-emerald-600" />
              <span className="truncate font-mono text-xs">{conexao.endereco}</span>
            </span>
            {canEdit && (
              <div className="ml-auto flex gap-2">
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
            <p className="text-sm text-muted-foreground">
              Quem fez o sistema de vocês passa o endereço e a chave. Até conectar, a IA deste WhatsApp fica só com o
              que faz dentro do CRM.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor={`mcp-url-${agentId}`}>Endereço do servidor (https)</Label>
              <Input
                id={`mcp-url-${agentId}`}
                value={endereco}
                disabled={!canEdit}
                onChange={(e) => setEndereco(e.target.value)}
                placeholder="https://mcp.seusistema.com/mcp"
                className="font-mono"
                spellCheck={false}
              />
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
                <Button disabled={!enderecoOk || conectar.isPending} onClick={enviarConexao}>
                  {conectar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plug className="mr-2 h-4 w-4" />}
                  {conectar.isPending ? 'Conectando...' : 'Conectar'}
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
      </div>

      {conexao && estado.ferramentas.length === 0 && (
        <p className="px-4 py-3 text-sm text-muted-foreground sm:px-6">
          O servidor não tem nenhuma ferramenta.
          {ativo && ' Depois que o sistema de vocês publicar, clique em "Alterar" e conecte de novo.'}
        </p>
      )}

      {conexao &&
        estado.ferramentas.map((f) => (
          <AbilityRow
            key={f.name}
            id={`mcp-tool-${f.name}`}
            label={f.label}
            help={f.description.length > 140 ? `${f.description.slice(0, 140)}…` : f.description}
            checked={ativo && f.ligada}
            disabled={!canEdit || !ativo || ligarFerramentas.isPending}
            onChange={(v) => alternarFerramenta(f.name, v)}
          >
            {ativo && f.isWrite && (
              <p className="text-xs text-amber-700 dark:text-amber-400">Muda dados: a IA confirma com o cliente antes.</p>
            )}
          </AbilityRow>
        ))}

      <ConfirmDialog
        open={confirmarDesconectar}
        onOpenChange={setConfirmarDesconectar}
        title="Desconectar o servidor MCP?"
        description="O Servidor MCP desliga e a IA deste WhatsApp para de usar as ferramentas dele. Dá para conectar de novo depois."
        confirmLabel="Desconectar"
        variant="destructive"
        isLoading={desconectar.isPending}
        onConfirm={async () => {
          try {
            await desconectar.mutateAsync();
            toast.success('Servidor MCP desconectado e desligado.');
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

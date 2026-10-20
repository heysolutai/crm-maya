import { apiFetch } from '@/lib/api/client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useInboxes } from '@/hooks/useInboxes';
import { useInboxMembers } from '@/hooks/useInboxMembers';
import { useTeam } from '@/hooks/useTeam';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  Bot,
  Loader2,
  Smartphone,
  Cloud,
  Instagram,
  Zap,
  Plug,
  ExternalLink,
  Inbox as InboxIcon,
  Users,
  Save,
  CheckSquare,
  Square,
  BookOpen,
  FlaskConical,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CHANNEL_REGISTRY, type ChannelType } from '@/lib/channels/types';
import { explicarErroConexao } from '@/lib/erros/envio';
import { cn } from '@/lib/utils';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useAuth } from '@/hooks/useAuth';
import { AgentTab } from '@/components/agente-ia/AgentTab';
import { FAQManager } from '@/components/settings/FAQManager';
import { PlaygroundChat } from '@/components/ai/PlaygroundChat';
import type { AIPermissionKey } from '@/components/super-admin/company-details/AIPermissionsConfig';

const channelIcon: Record<ChannelType, typeof Smartphone> = {
  uazapi: Smartphone,
  evolution_baileys: Zap,
  evolution_go: Zap,
  zapi: Zap,
  whatsapp_cloud: Cloud,
  instagram: Instagram,
  notificame: Cloud,
};

const statusStyles: Record<string, { dot: string; label: string; badge: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  connected: { dot: 'bg-emerald-500', label: 'Conectado', badge: 'default' },
  connecting: { dot: 'bg-amber-500', label: 'Conectando', badge: 'secondary' },
  disconnected: { dot: 'bg-gray-400', label: 'Desconectado', badge: 'outline' },
  error: { dot: 'bg-rose-500', label: 'Erro', badge: 'destructive' },
};

// Abas da conexão. Conexão e agente de IA são a mesma coisa (1:1): por isso o
// agente, as perguntas e respostas e o teste da IA moram aqui.
const baseTabs = [
  { id: 'connection', label: 'Conexão', icon: Plug },
  { id: 'members', label: 'Atendentes', icon: Users },
  { id: 'agent', label: 'Agente de IA', icon: Bot },
  { id: 'faq', label: 'Perguntas e respostas', icon: BookOpen },
];
// Sempre liberado: testa a IA (Maestro) sem precisar de número de WhatsApp.
const playgroundTab = { id: 'playground', label: 'Testar a IA', icon: FlaskConical };
const tabs = [...baseTabs, playgroundTab];

interface Props {
  inboxId: string;
}

export default function InboxDetail({ inboxId }: Props) {
  const router = useRouter();
  const { inboxes, isLoading } = useInboxes();
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const { company } = useCompanySettings();
  const { isSuperAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('connection');

  const inbox = inboxes.find((a) => a.id === inboxId);

  // Permissões de IA do restaurante (Company.settings.ai_permissions). Super-admin,
  // ou restaurante sem nenhuma permissão salva, vê tudo; com permissões salvas,
  // cada item restrito só aparece se estiver ligado.
  const podeVer = useMemo(() => {
    const settings = company?.settings as Record<string, unknown> | null | undefined;
    const bruto = settings?.ai_permissions;
    const aiPerms =
      bruto && typeof bruto === 'object' ? (bruto as Partial<Record<AIPermissionKey, boolean>>) : undefined;
    return (chave: AIPermissionKey): boolean => isSuperAdmin || !aiPerms || aiPerms[chave] === true;
  }, [isSuperAdmin, company]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!inbox) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.push('/app/inboxes')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para caixas de entrada
        </Button>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <InboxIcon className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Caixa de entrada não encontrada</h2>
          <p className="text-muted-foreground">
            Esta caixa de entrada não existe ou você não tem permissão para acessá-la.
          </p>
        </div>
      </div>
    );
  }

  const Icon = channelIcon[inbox.channel_type] || Smartphone;
  const channelMeta = CHANNEL_REGISTRY[inbox.channel_type];
  const status = statusStyles[inbox.status || 'disconnected'] || statusStyles.disconnected;

  // Agente dedicado desta conexao (1:1). Passa o id do agente; se faltar
  // (legado), o id da inbox tambem resolve no endpoint de ai-configurations.
  const aiAgentId = inbox.ai_agent_id || inbox.id;

  const renderContent = () => {
    switch (activeTab) {
      case 'connection':
        return <ConnectionTab inbox={inbox} />;
      case 'members':
        return <MembersTab inboxId={inbox.id} />;
      case 'agent':
        return companyId ? (
          <AgentTab
            inboxId={inbox.id}
            companyId={companyId}
            agentId={aiAgentId}
            isSuperAdmin={isSuperAdmin}
            canProviders={podeVer('integrations')}
            canTechnical={podeVer('settings')}
          />
        ) : null;
      case 'faq':
        return companyId ? <FAQManager companyId={companyId} /> : null;
      case 'playground':
        return companyId ? <PlaygroundChat companyId={companyId} agentId={aiAgentId} inboxId={inbox.id} /> : null;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/app/inboxes')}
          className="mb-4 -ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Caixas de entrada
        </Button>

        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="h-7 w-7 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-bold truncate">{inbox.display_name}</h1>
              <Badge variant={status.badge} className="shrink-0">
                <span className={cn('h-2 w-2 rounded-full mr-1.5', status.dot)} />
                {status.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {channelMeta?.label}
              {inbox.phone_number && (
                <>
                  {' · '}
                  <span className="font-mono">{inbox.phone_number}</span>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="md:flex md:gap-6">
        {/* Celular: abas em linha, com rolagem para o lado */}
        <div className="md:hidden overflow-x-auto -mx-4 px-4 pb-3">
          <div className="flex gap-2 w-max">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap border',
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:bg-muted'
                )}
              >
                <tab.icon className="h-4 w-4 shrink-0" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Computador: menu na lateral */}
        <nav className="hidden md:block w-56 shrink-0 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left',
                activeTab === tab.id
                  ? 'bg-primary/10 text-primary border-l-2 border-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <tab.icon className="h-4 w-4 shrink-0" />
              {tab.label}
            </button>
          ))}
        </nav>

        {/* O conteúdo é montado uma vez só (nada de formulário duplicado na tela) */}
        <div className="mt-1 min-w-0 flex-1 md:mt-0">{renderContent()}</div>
      </div>
    </div>
  );
}

function ConnectionTab({ inbox }: { inbox: ReturnType<typeof useInboxes>['inboxes'][number] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // Necessario pra super-admin personificado: as rotas /api/agents/[id]/* exigem
  // ?companyId= pra resolver o restaurante (senao retornam "Restaurante nao encontrado").
  const { effectiveCompanyId: companyId } = useEffectiveCompanyId();
  const { isSuperAdmin } = useAuth();
  const channelMeta = CHANNEL_REGISTRY[inbox.channel_type];
  const isAvailable = channelMeta?.status === 'available';
  const isTokenMode = channelMeta?.connectionMode === 'token';
  // Último problema da conexão em palavras simples (o texto cru só o super-admin vê).
  const ultimoProblema =
    inbox.error_message && inbox.status !== 'connected' ? explicarErroConexao(inbox.error_message) : null;

  const [qrLoading, setQrLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  const isConnected = inbox.status === 'connected';
  const isConnecting = inbox.status === 'connecting' && !!inbox.qr_code;

  // Polling de status enquanto estiver "connecting": checa a cada 4s
  useEffect(() => {
    if (inbox.status !== 'connecting') return;
    const interval = setInterval(async () => {
      try {
        const res = await apiFetch(`/api/agents/${inbox.id}/status?companyId=${companyId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'connected' || data.status === 'disconnected') {
          queryClient.invalidateQueries({ queryKey: ['inboxes'] });
        }
      } catch {
        /* silencioso: proximo tick tenta de novo */
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [inbox.status, inbox.id, queryClient]);

  const handleGenerateQr = async () => {
    setQrLoading(true);
    try {
      const res = await apiFetch(`/api/agents/${inbox.id}/qr?companyId=${companyId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao gerar QR');
      setPairingCode(data.pairing_code || null);
      queryClient.invalidateQueries({ queryKey: ['inboxes'] });
    } catch (e: any) {
      toast({ title: 'Erro ao gerar QR', description: e.message, variant: 'destructive' });
    } finally {
      setQrLoading(false);
    }
  };

  // Caixa recem-criada na tela de Conexoes (?conectar=1): ja abre o QR, sem o
  // admin ter que procurar o botao. Le a URL no efeito (nao useSearchParams)
  // pra nao exigir Suspense na pagina.
  const autoQrRef = useRef(false);
  useEffect(() => {
    if (autoQrRef.current) return;
    if (new URLSearchParams(window.location.search).get('conectar') !== '1') return;
    if (isTokenMode || !isAvailable || isConnected || inbox.qr_code) return;
    autoQrRef.current = true;
    void handleGenerateQr();
    // handleGenerateQr muda a cada render; o ref ja garante uma execucao so.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTokenMode, isAvailable, isConnected, inbox.qr_code]);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await apiFetch(`/api/agents/${inbox.id}/disconnect?companyId=${companyId}`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Falha ao desconectar');
      }
      queryClient.invalidateQueries({ queryKey: ['inboxes'] });
      toast({ title: 'Caixa de entrada desconectada' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  };

  if (!isAvailable) {
    return (
      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Conexão do canal</h3>
            <p className="text-sm text-muted-foreground">{channelMeta?.description}</p>
          </div>
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Plug className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
            <p className="font-medium">Canal em desenvolvimento</p>
            <p className="text-sm text-muted-foreground mt-1">
              O adapter para <strong>{channelMeta?.label}</strong> ainda não foi implementado.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div>
          <h3 className="text-lg font-semibold">Conexão do canal</h3>
          <p className="text-sm text-muted-foreground">{channelMeta?.description}</p>
        </div>

        {inbox.api_url && (
          <div className="text-xs text-muted-foreground space-y-1">
            <div>
              <span className="font-medium">Servidor:</span>{' '}
              <span className="font-mono">{inbox.api_url}</span>
            </div>
            <div>
              <span className="font-medium">Instância:</span>{' '}
              <span className="font-mono">{inbox.instance_name}</span>
            </div>
          </div>
        )}

        {ultimoProblema && (
          <div className="space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
            <p className="font-semibold text-destructive">Último problema</p>
            <p className="leading-snug">{ultimoProblema.motivo}</p>
            <p className="leading-snug">
              <span className="font-semibold">O que fazer: </span>
              {ultimoProblema.oQueFazer}
            </p>
            {isSuperAdmin && (
              <p className="break-words font-mono text-[11px] text-muted-foreground">{inbox.error_message}</p>
            )}
          </div>
        )}

        {isTokenMode ? (
          <div className="rounded-lg border bg-muted/30 p-6 space-y-3 text-center">
            <Cloud className="h-10 w-10 mx-auto text-muted-foreground" />
            <div>
              {inbox.channel_type === 'whatsapp_cloud' ? (
                <>
                  <p className="font-medium">
                    {isConnected ? 'WhatsApp Cloud ativo' : 'WhatsApp Cloud desconectado'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    API oficial do WhatsApp: sem QR Code. O recebimento de mensagens foi configurado automaticamente.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Fora da janela de 24h após a última mensagem do cliente, a Meta só aceita mensagens de template.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">
                    {isConnected ? 'Canal ativo via API token' : 'Canal configurado via API token'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Sem QR Code: autenticação via token na API NotificaMe. Status sincroniza automaticamente.
                  </p>
                </>
              )}
            </div>
            {inbox.channel_config &&
              typeof inbox.channel_config === 'object' &&
              (inbox.channel_config as any)?.channelId && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">Channel UUID: </span>
                  <span className="font-mono">{(inbox.channel_config as any).channelId}</span>
                </div>
              )}
          </div>
        ) : isConnected ? (
          <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 p-6 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center mx-auto">
              <Smartphone className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="font-semibold">Conectado</p>
              {inbox.phone_number && (
                <p className="text-sm text-muted-foreground font-mono">{inbox.phone_number}</p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Desconectar
            </Button>
          </div>
        ) : isConnecting && inbox.qr_code ? (
          <div className="rounded-lg border bg-muted/30 p-6 space-y-4 text-center">
            <div className="border-4 border-foreground rounded-lg p-3 bg-background inline-block">
              <img src={inbox.qr_code} alt="QR Code" className="w-64 h-64" />
            </div>
            {pairingCode && (
              <div className="text-sm">
                <p className="text-muted-foreground">Ou use o pairing code:</p>
                <p className="font-mono text-lg font-semibold tracking-wider">{pairingCode}</p>
              </div>
            )}
            <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Aguardando conexão...</span>
            </div>
            <div className="text-xs text-muted-foreground space-y-1 text-left max-w-xs mx-auto">
              <p className="font-medium text-center">Como conectar:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Abra o WhatsApp no celular</li>
                <li>
                  Toque em <strong>Mais opções → Aparelhos conectados</strong>
                </li>
                <li>
                  Toque em <strong>Conectar um aparelho</strong>
                </li>
                <li>Aponte para esta tela</li>
              </ol>
            </div>
            <Button variant="outline" size="sm" onClick={handleGenerateQr} disabled={qrLoading}>
              {qrLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Gerar novo QR
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border bg-muted/30 p-6 text-center space-y-3">
            <Smartphone className="h-10 w-10 mx-auto text-muted-foreground" />
            <div>
              <p className="font-medium">Pronto para conectar</p>
              <p className="text-sm text-muted-foreground">
                Gere o QR Code para vincular esta caixa de entrada ao WhatsApp.
              </p>
            </div>
            <Button onClick={handleGenerateQr} disabled={qrLoading}>
              {qrLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Gerar QR Code
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MembersTab({ inboxId }: { inboxId: string }) {
  const { members, memberUserIds, isLoading, replaceMembers, isSaving } = useInboxMembers(inboxId);
  const { teamMembers, isLoading: loadingTeam } = useTeam();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  // Sincroniza estado local com o que esta salvo no banco
  useEffect(() => {
    if (!isLoading) {
      setSelected(new Set(memberUserIds));
    }
  }, [isLoading, memberUserIds.join(',')]);

  const isAllSelected = teamMembers.length > 0 && selected.size === teamMembers.length;
  const dirty =
    selected.size !== memberUserIds.length ||
    [...selected].some((id) => !memberUserIds.includes(id));

  const filtered = teamMembers.filter((m: any) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (m.full_name || '').toLowerCase().includes(q) ||
      (m.email || '').toLowerCase().includes(q)
    );
  });

  const toggleAll = () => {
    if (isAllSelected) setSelected(new Set());
    else setSelected(new Set(teamMembers.map((m: any) => m.id)));
  };

  const toggle = (userId: string) => {
    const next = new Set(selected);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    setSelected(next);
  };

  const handleSave = () => {
    replaceMembers([...selected]);
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Atendentes desta caixa
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Apenas atendentes selecionados podem ver as conversas desta inbox e participam do round-robin quando a IA transfere.
            </p>
          </div>
          <Badge variant="outline" className="shrink-0">
            {selected.size} de {teamMembers.length} selecionado(s)
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Buscar atendente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border rounded-md bg-background"
          />
          <Button variant="outline" size="sm" onClick={toggleAll} disabled={teamMembers.length === 0}>
            {isAllSelected ? (
              <><Square className="h-4 w-4 mr-2" /> Desmarcar todos</>
            ) : (
              <><CheckSquare className="h-4 w-4 mr-2" /> Selecionar todos</>
            )}
          </Button>
        </div>

        {loadingTeam || isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : teamMembers.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
            Nenhum atendente cadastrado neste restaurante.
          </div>
        ) : (
          <div className="space-y-1 max-h-[420px] overflow-y-auto -mx-1 px-1">
            {filtered.map((m: any) => {
              const isSel = selected.has(m.id);
              return (
                <label
                  key={m.id}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-md cursor-pointer transition-colors',
                    isSel ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/40'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => toggle(m.id)}
                    className="h-4 w-4 rounded"
                  />
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={m.avatar_url || undefined} alt={m.full_name || ''} />
                    <AvatarFallback className="text-xs">
                      {(m.full_name || m.email || '?').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{m.full_name || m.email}</p>
                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  </div>
                  {!m.is_active && (
                    <Badge variant="outline" className="text-[10px]">Inativo</Badge>
                  )}
                </label>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">Nenhum resultado.</p>
            )}
          </div>
        )}

        <div className="flex justify-end pt-2 border-t">
          <Button onClick={handleSave} disabled={!dirty || isSaving}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar
          </Button>
        </div>

        {members.length > 0 && (
          <div className="text-xs text-muted-foreground border-t pt-3">
            <strong>Como funciona:</strong> conversas desta inbox só aparecem pros atendentes
            selecionados. A IA distribui em round-robin entre eles quando transfere.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

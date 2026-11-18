'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Copy, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAvisoEquipe, useRegrasEncaminhamento, type ConfigAviso } from '@/hooks/useSolicitacoes';
import { TEMPLATE_SUGERIDO, textoDoAviso, textoDoTemplate, type ConteudoAviso } from '@/lib/solicitacoes/aviso-texto';
import { FUNIS, type Funil } from '@/lib/solicitacoes/funis';
import { cn } from '@/lib/utils';
import { ListaTelefones } from './ListaTelefones';
import { Passo } from './Passo';
import { WhatsAppPreview } from './WhatsAppPreview';
import { telefone } from './formatos';

const DA_CONVERSA = '__conversa__';

const EXEMPLO: Record<Funil, { categoria: string; resumo: string; dados: [string, string][] }> = {
  eventos: {
    categoria: 'Evento personalizado',
    resumo: 'Quer fazer o aniversário de 30 anos com cardápio fechado',
    dados: [
      ['Tipo de evento', 'Aniversário de 30 anos'],
      ['Data', '14/12/2026'],
      ['Número de pessoas', '40'],
      ['Orçamento', 'uns R$ 4 mil'],
    ],
  },
  atendimento: {
    categoria: 'Reclamação',
    resumo: 'A pizza chegou fria no delivery de sábado',
    dados: [['O que aconteceu', 'A pizza chegou fria']],
  },
};

function iguais(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Aviso no WhatsApp da equipe quando chega uma solicitação nova: tudo num
 * lugar só (números do funil, conexão de envio e extras por categoria).
 */
export function AvisoEquipe({ funil }: { funil: Funil }) {
  const { config, salvar, testar } = useAvisoEquipe(funil, true);
  const regrasApi = useRegrasEncaminhamento();
  const regras = useMemo(() => (regrasApi.lista.data ?? []).filter((r) => r.funnel === funil), [regrasApi.lista.data, funil]);

  const [form, setForm] = useState<ConfigAviso | null>(null);
  const [extras, setExtras] = useState<Record<string, string[]>>({});
  const [extrasAbertos, setExtrasAbertos] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!config.data) return;
    setForm({
      funil: config.data.funil,
      enabled: config.data.enabled,
      inboxId: config.data.inboxId,
      phones: config.data.phones,
      templateName: config.data.templateName,
      templateLanguage: config.data.templateLanguage,
    });
  }, [config.data]);

  useEffect(() => {
    setExtras(Object.fromEntries(regras.map((r) => [r.id, r.notifyPhones])));
    if (regras.some((r) => r.notifyPhones.length)) setExtrasAbertos(true);
  }, [regras]);

  if (config.isLoading || !form || !config.data) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { conexoes } = config.data;
  const conexao = form.inboxId ? conexoes.find((c) => c.id === form.inboxId) ?? null : null;
  // Sem conexão escolhida, sai pela conversa do cliente (pode ser a oficial).
  const podeSerOficial = conexao ? conexao.oficial : conexoes.some((c) => c.oficial);
  const set = (patch: Partial<ConfigAviso>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const configMudou =
    form.enabled !== config.data.enabled ||
    form.inboxId !== config.data.inboxId ||
    !iguais(form.phones, config.data.phones) ||
    (form.templateName || null) !== (config.data.templateName || null) ||
    form.templateLanguage !== config.data.templateLanguage;
  const extrasMudados = regras.filter((r) => !iguais(extras[r.id] ?? [], r.notifyPhones));
  const mudou = configMudou || extrasMudados.length > 0;
  const totalExtras = Object.values(extras).reduce((s, l) => s + l.length, 0);

  const enviar = async () => {
    setSalvando(true);
    try {
      if (configMudou) await salvar.mutateAsync(form);
      for (const r of extrasMudados) await regrasApi.salvar.mutateAsync({ id: r.id, notifyPhones: extras[r.id] ?? [] });
      toast.success(form.enabled ? 'Aviso salvo. A equipe recebe as próximas solicitações.' : 'Aviso desligado.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const fazerTeste = async () => {
    try {
      const r = await testar.mutateAsync();
      if (r.ok) toast.success(r.mensagem);
      else toast.error(r.mensagem);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // Prévia: o celular de quem recebe, com a mensagem vinda do WhatsApp do restaurante.
  const exemplo = EXEMPLO[funil];
  const conteudo: ConteudoAviso = {
    funil,
    categoria: exemplo.categoria,
    clienteNome: 'Ana Souza',
    clienteTelefone: '(41) 99999-0000',
    resumo: exemplo.resumo,
    dados: exemplo.dados,
    link: `https://app.maya/crm?funil=${funil}`,
  };
  const viaTemplate = conexao?.oficial ?? false;
  const textoPrevia = viaTemplate ? textoDoTemplate(conteudo) : textoDoAviso(conteudo);
  const remetente = conexao?.nome || conexoes[0]?.nome || 'WhatsApp do restaurante';

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto bg-muted/20">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <Passo
              n={1}
              titulo="Ligar o aviso"
              dica={`Cada solicitação nova em ${FUNIS[funil].label} manda uma mensagem no WhatsApp da equipe.`}
              acao={<Switch checked={form.enabled} onCheckedChange={(enabled) => set({ enabled })} aria-label="Ligar o aviso" />}
              ultimo={!form.enabled}
            />

            {form.enabled && (
              <>
                <Passo n={2} titulo="Quem recebe" dica="Os WhatsApp da equipe que recebem todo aviso deste funil.">
                  <ListaTelefones id={`aviso-numeros-${funil}`} numeros={form.phones} onChange={(phones) => set({ phones })} />
                  <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                    A IA não atende esses números: se alguém da equipe responder o aviso, ela não conversa como se fosse cliente.
                  </p>
                </Passo>

                <Passo n={3} titulo="Por qual WhatsApp o aviso sai" dica="O número do restaurante que manda a mensagem para a equipe.">
                  <Select value={form.inboxId ?? DA_CONVERSA} onValueChange={(v) => set({ inboxId: v === DA_CONVERSA ? null : v })}>
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DA_CONVERSA}>O mesmo WhatsApp em que o cliente falou</SelectItem>
                      {conexoes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                          {c.telefone ? ` · ${telefone(c.telefone)}` : ''}
                          {c.oficial ? ' · API oficial' : ''}
                          {!c.conectada ? ' (desconectado)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {podeSerOficial && (
                    <div className="space-y-3 rounded-xl border bg-muted/40 p-4">
                      <div>
                        <p className="text-sm font-semibold">Template da API oficial</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {conexao?.oficial
                            ? 'A API oficial só envia aviso com um template aprovado na Meta.'
                            : 'Se o aviso sair por uma conexão da API oficial, ele usa este template aprovado na Meta.'}
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
                        <div className="space-y-1">
                          <Label htmlFor={`aviso-template-${funil}`} className="text-xs">
                            Nome do template na Meta
                          </Label>
                          <Input
                            id={`aviso-template-${funil}`}
                            value={form.templateName ?? ''}
                            onChange={(e) => set({ templateName: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') || null })}
                            placeholder="aviso_solicitacao_crm"
                            className="bg-background"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`aviso-idioma-${funil}`} className="text-xs">
                            Idioma
                          </Label>
                          <Input
                            id={`aviso-idioma-${funil}`}
                            value={form.templateLanguage}
                            onChange={(e) => set({ templateLanguage: e.target.value.trim() })}
                            placeholder="pt_BR"
                            className="bg-background"
                          />
                        </div>
                      </div>
                      <div className="rounded-lg border bg-background p-3">
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold">Texto para aprovar (categoria Utilidade)</p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1.5 px-2 text-xs"
                            onClick={() => {
                              navigator.clipboard.writeText(TEMPLATE_SUGERIDO).then(
                                () => toast.success('Texto copiado. Cole na Meta como template de Utilidade.'),
                                () => toast.error('Não foi possível copiar.')
                              );
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Copiar
                          </Button>
                        </div>
                        <pre className="whitespace-pre-wrap font-sans text-xs text-muted-foreground">{TEMPLATE_SUGERIDO}</pre>
                      </div>
                    </div>
                  )}
                </Passo>

                <Passo
                  n={4}
                  titulo="Avisar também, por categoria (opcional)"
                  dica="Números extras que recebem só um tipo de solicitação. Ex.: reclamação também avisa o dono."
                  acao={
                    <Button variant="ghost" size="sm" className="shrink-0 gap-1" onClick={() => setExtrasAbertos((v) => !v)}>
                      {totalExtras > 0 ? `${totalExtras} ${totalExtras === 1 ? 'número' : 'números'}` : 'Configurar'}
                      <ChevronDown className={cn('h-4 w-4 transition-transform', extrasAbertos && 'rotate-180')} />
                    </Button>
                  }
                  ultimo
                >
                  {extrasAbertos ? (
                    <ul className="space-y-3">
                      {regras.map((r) => (
                        <li key={r.id} className="rounded-xl border bg-background p-3">
                          <p className="mb-2 text-sm font-semibold">{r.name}</p>
                          <ListaTelefones
                            id={`extra-${r.id}`}
                            numeros={extras[r.id] ?? []}
                            onChange={(ns) => setExtras((e) => ({ ...e, [r.id]: ns }))}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Passo>
              </>
            )}
          </div>

          <aside className="lg:sticky lg:top-0 lg:self-start">
            <p className="mb-3 text-center text-sm font-semibold">Como a equipe recebe no WhatsApp</p>
            <WhatsAppPreview
              contato={remetente}
              subtitulo={viaTemplate ? 'Conta comercial' : 'online'}
              mensagens={[{ de: 'outro', texto: textoPrevia, hora: '19:04' }]}
              className={cn(!form.enabled && 'opacity-50 grayscale')}
            />
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {form.enabled
                ? viaTemplate
                  ? 'Pela API oficial: chega como o template aprovado.'
                  : 'O link abre o card direto no CRM.'
                : 'Ligue o aviso para a equipe receber.'}
            </p>
          </aside>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-background px-6 py-4">
        {config.data.enabled && config.data.phones.length > 0 && (
          <Button variant="outline" onClick={fazerTeste} disabled={testar.isPending || mudou}>
            {testar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Enviar teste
          </Button>
        )}
        <Button onClick={enviar} disabled={salvando || !mudou}>
          {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar aviso
        </Button>
      </div>
    </div>
  );
}

'use client';

import { useRef, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  Check,
  FlaskConical,
  ImagePlus,
  ListChecks,
  Loader2,
  Plus,
  Presentation,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { enviarFoto, useRegrasEncaminhamento, type RegraApi, type RegraEditavel } from '@/hooks/useSolicitacoes';
import { FUNIS, VARIAVEIS_RESPOSTA, preencherResposta, type Funil } from '@/lib/solicitacoes/funis';
import { PEDIDO_PADRAO, mensagemPedindoDados, respostaJuntaDoExemplo, resumoDoExemplo } from '@/lib/solicitacoes/perguntas';
import { cn } from '@/lib/utils';
import { ListaEditavel } from './ListaEditavel';
import { Passo } from './Passo';
import { WhatsAppPreview, type MensagemPreview } from './WhatsAppPreview';

interface Props {
  funil: Funil;
  /** null = nova regra. */
  regra: RegraApi | null;
  restaurante: string;
  onVoltar: () => void;
  /** Depois de salvar, abre a aba "Testar a IA". */
  onTestar?: () => void;
}

const FRASE_PADRAO: Record<Funil, string> = {
  eventos: 'Oi! Quero fazer meu aniversário aí com cardápio fechado',
  atendimento: 'Vocês aceitam vale-refeição?',
};

const MAX_FOTOS = 5;

function vazia(funil: Funil): RegraEditavel {
  return {
    funnel: funil,
    name: '',
    tag: '',
    trigger: '',
    notWhen: '',
    examples: [],
    collectFields: [],
    askMessage: '',
    flowMode: 'coletar',
    introMessage: '',
    introImages: [],
    responseMessage: '',
    responseMode: 'adaptar',
    pauseAi: true,
    notifyPhones: [],
    isActive: true,
  };
}

/** Escolha em cartão (rádio visual). */
function Opcao({
  ativa,
  onClick,
  icone: Icone,
  titulo,
  dica,
}: {
  ativa: boolean;
  onClick: () => void;
  icone: typeof Users;
  titulo: string;
  dica: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativa}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        ativa
          ? 'border-primary/50 bg-primary/[0.03] shadow-[0_0_0_1px_hsl(var(--primary)/0.15),0_6px_20px_-12px_hsl(var(--primary)/0.5)]'
          : 'hover:border-foreground/20'
      )}
    >
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', ativa ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
        <Icone className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{titulo}</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{dica}</span>
      </span>
      {ativa && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
}

/** Dados que a IA pede, na ordem da lista numerada. */
function ListaDados({ campos, onChange }: { campos: string[]; onChange: (campos: string[]) => void }) {
  const [novo, setNovo] = useState('');
  const adicionar = () => {
    const v = novo.trim();
    if (!v || campos.length >= 8 || campos.some((c) => c.toLowerCase() === v.toLowerCase())) return;
    onChange([...campos, v]);
    setNovo('');
  };

  return (
    <div className="space-y-3">
      {campos.length > 0 ? (
        <ol className="space-y-2">
          {campos.map((campo, i) => (
            <li key={campo} className="flex items-center gap-2.5 rounded-xl border bg-background px-3 py-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
              <span className="flex-1 text-sm font-semibold">{campo}</span>
              <button
                type="button"
                onClick={() => onChange(campos.filter((_, j) => j !== i))}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Tirar ${campo}`}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground">Nenhum dado: a IA encaminha direto, sem perguntar nada.</p>
      )}
      <div className="flex gap-2">
        <Input
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              adicionar();
            }
          }}
          placeholder="Novo dado. Ex.: Ideia de cardápio"
          disabled={campos.length >= 8}
          aria-label="Novo dado"
        />
        <Button type="button" variant="outline" className="shrink-0" onClick={adicionar} disabled={!novo.trim() || campos.length >= 8}>
          <Plus className="mr-1.5 h-4 w-4" />
          Adicionar
        </Button>
      </div>
    </div>
  );
}

/** Fotos da apresentação: sobe do computador, mostra miniatura, tira com o X. */
function Fotos({ urls, onChange }: { urls: string[]; onChange: (u: string[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  const escolher = async (arquivos: FileList | null) => {
    if (!arquivos?.length) return;
    const livres = MAX_FOTOS - urls.length;
    const lista = Array.from(arquivos).slice(0, livres);
    setEnviando(true);
    try {
      const novas: string[] = [];
      for (const a of lista) novas.push(await enviarFoto(a));
      onChange([...urls, ...novas]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {urls.map((u) => (
          <div key={u} className="group relative h-20 w-20 overflow-hidden rounded-lg border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(urls.filter((x) => x !== u))}
              className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              aria-label="Tirar foto"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {urls.length < MAX_FOTOS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={enviando}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
            {enviando ? 'Enviando' : 'Foto'}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => escolher(e.target.files)}
      />
      <p className="text-xs text-muted-foreground">Até {MAX_FOTOS} fotos (JPG, PNG ou WebP, até 5 MB). Ex.: cardápio de eventos, o espaço, pacotes.</p>
    </div>
  );
}

/** Edição de uma regra em passos, com a conversa completa no WhatsApp ao lado. */
export function EditorRegra({ funil, regra, restaurante, onVoltar, onTestar }: Props) {
  const { salvar, criar, apagar } = useRegrasEncaminhamento();
  const [form, setForm] = useState<RegraEditavel>(() =>
    regra
      ? {
          funnel: regra.funnel as Funil,
          name: regra.name,
          tag: regra.tag,
          trigger: regra.trigger,
          notWhen: regra.notWhen,
          examples: regra.examples,
          collectFields: regra.collectFields,
          askMessage: regra.askMessage,
          flowMode: regra.flowMode,
          introMessage: regra.introMessage,
          introImages: regra.introImages,
          responseMessage: regra.responseMessage,
          responseMode: regra.responseMode,
          pauseAi: regra.pauseAi,
          notifyPhones: regra.notifyPhones,
          isActive: regra.isActive,
        }
      : vazia(funil)
  );
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const respostaRef = useRef<HTMLTextAreaElement>(null);
  const sistema = regra?.isSystem ?? false;
  const salvando = salvar.isPending || criar.isPending;
  const set = (patch: Partial<RegraEditavel>) => setForm((f) => ({ ...f, ...patch }));
  const eventos = funil === 'eventos';
  const apresentar = eventos && form.flowMode === 'apresentar';

  const inserirVariavel = (chave: string) => {
    const el = respostaRef.current;
    const atual = form.responseMessage;
    if (!el) return set({ responseMessage: `${atual}${chave}` });
    const ini = el.selectionStart ?? atual.length;
    const fim = el.selectionEnd ?? atual.length;
    set({ responseMessage: atual.slice(0, ini) + chave + atual.slice(fim) });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(ini + chave.length, ini + chave.length);
    });
  };

  const enviar = async (depois: 'voltar' | 'testar' = 'voltar') => {
    if (apresentar && !form.introMessage.trim()) {
      toast.error('Escreva o texto da apresentação ou escolha "Coleta direta".');
      return;
    }
    try {
      if (regra) await salvar.mutateAsync({ id: regra.id, ...form });
      else await criar.mutateAsync(form);
      toast.success(regra ? 'Regra salva. A IA já segue a nova versão.' : 'Regra criada. A IA já pode usar.');
      if (depois === 'testar' && onTestar) onTestar();
      else onVoltar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // Conversa de exemplo, do jeito que o cliente vê. O resumo final usa SÓ o
  // que o cliente respondeu aqui: é exatamente o que a IA foi instruída a fazer.
  const frase = form.examples[0] || FRASE_PADRAO[funil];
  const conversa: MensagemPreview[] = [{ de: 'eu', texto: frase, hora: '19:02' }];
  if (apresentar && form.introMessage.trim()) {
    conversa.push({ de: 'outro', texto: form.introMessage.trim(), imagens: form.introImages, hora: '19:02' });
  }
  if (form.collectFields.length) {
    // A lista numa mensagem e o cliente responde tudo junto.
    conversa.push({ de: 'outro', texto: mensagemPedindoDados(form.collectFields, form.askMessage), hora: '19:03' });
    conversa.push({ de: 'eu', texto: respostaJuntaDoExemplo(form.collectFields), hora: '19:05' });
  }
  const resposta = preencherResposta(form.responseMessage, {
    nome: 'Ana',
    resumo: resumoDoExemplo(form.collectFields, frase),
    restaurante,
  });
  if (resposta) conversa.push({ de: 'outro', texto: resposta, hora: '19:09' });
  if (form.pauseAi && resposta) conversa.push({ de: 'nota', texto: 'A conversa vai para a equipe e a IA para de responder.' });

  // Numeração dos passos (eventos tem o passo da triagem).
  let n = 0;
  const proximo = () => ++n;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <Button variant="ghost" size="icon" className="-ml-2 h-9 w-9" onClick={onVoltar} aria-label="Voltar para as regras">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{FUNIS[funil].label}</p>
          <h2 className="truncate text-lg font-semibold">{regra ? regra.name : 'Nova regra'}</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-muted/20">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            {sistema ? (
              <>
                <div className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">
                  <p className="font-semibold text-foreground">Regra automática</p>
                  <p className="mt-1">
                    Quando a IA não consegue responder por um problema técnico (sem crédito, fora do ar), a conversa vai para a equipe e
                    uma solicitação é aberta aqui. O texto é do sistema; dá para trocar a etiqueta ou desligar na lista.
                  </p>
                </div>
                <Passo n={1} titulo="Etiqueta na conversa" dica="Aparece na conversa e serve de filtro em Atendimentos." ultimo>
                  <Input value={form.tag} onChange={(e) => set({ tag: e.target.value })} maxLength={60} aria-label="Etiqueta na conversa" />
                </Passo>
              </>
            ) : (
              <>
                <Passo
                  n={proximo()}
                  titulo="Quando a IA encaminha"
                  dica="Seja claro: a IA só encaminha quando o pedido combina com o 'Quando usar' e não cai no 'Quando NÃO usar'."
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="regra-nome">Nome da regra</Label>
                    <Input
                      id="regra-nome"
                      value={form.name}
                      onChange={(e) => set({ name: e.target.value })}
                      placeholder={eventos ? 'Ex.: Casamento' : 'Ex.: Reclamação'}
                      maxLength={60}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="regra-quando" className="flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      Quando usar
                    </Label>
                    <Textarea
                      id="regra-quando"
                      value={form.trigger}
                      onChange={(e) => set({ trigger: e.target.value })}
                      placeholder="Ex.: o cliente quer fazer um casamento ou festa de noivado no restaurante."
                      rows={4}
                      maxLength={1000}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="regra-nao" className="flex items-center gap-1.5">
                      <X className="h-3.5 w-3.5 text-destructive" />
                      Quando NÃO usar
                    </Label>
                    <Textarea
                      id="regra-nao"
                      value={form.notWhen}
                      onChange={(e) => set({ notWhen: e.target.value })}
                      placeholder="Ex.: reserva comum de mesa, mesmo de aniversário, sem cardápio fechado."
                      rows={2}
                      maxLength={1000}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="regra-exemplos">Frases que o cliente costuma mandar</Label>
                    <ListaEditavel
                      id="regra-exemplos"
                      itens={form.examples}
                      onChange={(examples) => set({ examples })}
                      placeholder="Ex.: Vocês fazem casamento?"
                      max={10}
                      aspas
                    />
                  </div>
                </Passo>

                {eventos && (
                  <Passo n={proximo()} titulo="Como a IA conduz (triagem)" dica="Escolha se a IA já coleta os dados ou se primeiro apresenta o que o restaurante oferece.">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Opcao
                        ativa={form.flowMode === 'coletar'}
                        onClick={() => set({ flowMode: 'coletar' })}
                        icone={ListChecks}
                        titulo="Coleta direta"
                        dica="A IA já pergunta os dados e encaminha."
                      />
                      <Opcao
                        ativa={form.flowMode === 'apresentar'}
                        onClick={() => set({ flowMode: 'apresentar' })}
                        icone={Presentation}
                        titulo="Apresenta e depois coleta"
                        dica="A IA manda uma apresentação (com ou sem fotos), depois pergunta os dados."
                      />
                    </div>
                    {apresentar && (
                      <div className="space-y-4 rounded-xl border bg-background p-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="regra-apresentacao">Texto da apresentação</Label>
                          <Textarea
                            id="regra-apresentacao"
                            value={form.introMessage}
                            onChange={(e) => set({ introMessage: e.target.value })}
                            placeholder="Ex.: Que bom que pensou na gente! Temos pacotes para grupos de 20 a 120 pessoas, com cardápio fechado e espaço reservado. Veja as fotos 👇"
                            rows={4}
                            maxLength={1000}
                          />
                          <p className="text-xs text-muted-foreground">Vai exatamente como está escrito (com as fotos, como legenda da primeira).</p>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Fotos (opcional)</Label>
                          <Fotos urls={form.introImages} onChange={(introImages) => set({ introImages })} />
                        </div>
                      </div>
                    )}
                  </Passo>
                )}

                <Passo
                  n={proximo()}
                  titulo="Os dados que a IA pede"
                  dica="Tudo numa mensagem só: a frase e a lista numerada logo abaixo. A IA tira o que o cliente já disse, pede só o que faltar e nunca preenche um dado sozinha."
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="regra-pedido">Frase que abre o pedido</Label>
                    <Input
                      id="regra-pedido"
                      value={form.askMessage}
                      onChange={(e) => set({ askMessage: e.target.value })}
                      placeholder={PEDIDO_PADRAO}
                      maxLength={500}
                    />
                  </div>
                  <ListaDados campos={form.collectFields} onChange={(collectFields) => set({ collectFields })} />
                  {form.collectFields.length > 5 && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Mais de 5 dados numa mensagem costuma assustar o cliente. Deixe só o essencial.
                    </p>
                  )}
                </Passo>

                <Passo n={proximo()} titulo="O que a IA responde ao final" dica="A mensagem que fecha o encaminhamento. Veja ao lado a conversa completa.">
                  <div className="space-y-2">
                    <Textarea
                      ref={respostaRef}
                      id="regra-resposta"
                      value={form.responseMessage}
                      onChange={(e) => set({ responseMessage: e.target.value })}
                      placeholder="Ex.: Perfeito, {nome}! Anotei tudo: {resumo}. Nossa equipe vai falar com você em seguida."
                      rows={3}
                      maxLength={1000}
                      aria-label="Resposta ao cliente"
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">Inserir:</span>
                      {VARIAVEIS_RESPOSTA.map((v) => (
                        <button
                          key={v.chave}
                          type="button"
                          onClick={() => inserirVariavel(v.chave)}
                          title={`Vira: ${v.descricao.toLowerCase()}`}
                          className="rounded-md border bg-background px-2 py-0.5 text-xs font-medium hover:bg-muted"
                        >
                          {v.descricao.replace('Primeiro nome do cliente', 'Nome do cliente')}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">O resumo é montado só com o que o cliente respondeu.</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Opcao
                      ativa={form.responseMode === 'adaptar'}
                      onClick={() => set({ responseMode: 'adaptar' })}
                      icone={Bot}
                      titulo="A IA adapta ao contexto"
                      dica="Mais natural, sem mudar o sentido. Recomendado."
                    />
                    <Opcao
                      ativa={form.responseMode === 'exato'}
                      onClick={() => set({ responseMode: 'exato' })}
                      icone={Check}
                      titulo="Enviar este texto exato"
                      dica="A IA manda a mensagem sem nenhuma mudança."
                    />
                  </div>
                </Passo>

                <Passo n={proximo()} titulo="Depois de encaminhar" dica="O que acontece com a conversa e como ela fica marcada." ultimo>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Opcao
                      ativa={form.pauseAi}
                      onClick={() => set({ pauseAi: true })}
                      icone={Users}
                      titulo="A equipe assume"
                      dica='A conversa vai para "Aguardando atendente" e a IA para de responder este cliente.'
                    />
                    <Opcao
                      ativa={!form.pauseAi}
                      onClick={() => set({ pauseAi: false })}
                      icone={Bot}
                      titulo="A IA continua"
                      dica="A solicitação fica registrada e a IA segue conversando."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="regra-etiqueta">Etiqueta na conversa</Label>
                    <Input
                      id="regra-etiqueta"
                      value={form.tag}
                      onChange={(e) => set({ tag: e.target.value })}
                      placeholder="Ex.: Evento personalizado"
                      maxLength={60}
                    />
                    <p className="text-xs text-muted-foreground">Serve de filtro em Atendimentos. Quem é avisado fica na aba &quot;Aviso à equipe&quot;.</p>
                  </div>
                </Passo>
              </>
            )}
          </div>

          {!sistema && (
            <aside className="lg:sticky lg:top-0 lg:self-start">
              <p className="mb-3 text-center text-sm font-semibold">Como o cliente vê no WhatsApp</p>
              <WhatsAppPreview contato={restaurante} subtitulo="Conta comercial" mensagens={conversa} alturaMax={520} />
              <p className="mt-3 text-center text-xs text-muted-foreground">Conversa de exemplo com a cliente Ana. Muda enquanto você edita.</p>
            </aside>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t bg-background px-6 py-4">
        {regra && !sistema ? (
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmarApagar(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Apagar regra
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          {!sistema && (
            <label className="hidden items-center gap-2 text-sm sm:flex">
              <Switch checked={form.isActive} onCheckedChange={(isActive) => set({ isActive })} />
              {form.isActive ? 'Ligada' : 'Desligada'}
            </label>
          )}
          <Button variant="outline" onClick={onVoltar} disabled={salvando}>
            Cancelar
          </Button>
          {onTestar && !sistema && (
            <Button variant="outline" onClick={() => enviar('testar')} disabled={salvando}>
              <FlaskConical className="mr-2 h-4 w-4" />
              Salvar e testar
            </Button>
          )}
          <Button onClick={() => enviar()} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {regra ? 'Salvar regra' : 'Criar regra'}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmarApagar}
        onOpenChange={setConfirmarApagar}
        title="Apagar esta regra?"
        description="A IA deixa de usar esta regra na hora. As solicitações já abertas continuam no CRM."
        confirmLabel="Apagar regra"
        variant="destructive"
        isLoading={apagar.isPending}
        onConfirm={async () => {
          if (!regra) return;
          try {
            await apagar.mutateAsync(regra.id);
            toast.success('Regra apagada.');
            setConfirmarApagar(false);
            onVoltar();
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}

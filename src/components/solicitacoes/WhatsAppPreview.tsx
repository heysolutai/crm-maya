'use client';

import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, Camera, Mic, MoreVertical, Paperclip, Phone, Smile, Video } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Logo oficial do WhatsApp (glifo). Cor pela prop className (text-[#25D366]). */
export function WhatsAppLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

export interface MensagemPreview {
  /**
   * 'eu' = quem segura o celular (balão verde, à direita); 'outro' = quem fala
   * com ele (branco, à esquerda); 'nota' = faixa centralizada (explicação da prévia).
   */
  de: 'eu' | 'outro' | 'nota';
  texto: string;
  hora?: string;
  /** Fotos da mensagem (o texto vira a legenda, como no WhatsApp). */
  imagens?: string[];
}

/** Fotos num balão: 1 grande; 2 a 4 em grade; mais que 4 mostra "+N". */
function Fotos({ urls }: { urls: string[] }) {
  if (urls.length === 1) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={urls[0]} alt="" className="mb-1 aspect-[4/3] w-[240px] max-w-full rounded-md object-cover" />;
  }
  const visiveis = urls.slice(0, 4);
  return (
    <div className="mb-1 grid w-[240px] max-w-full grid-cols-2 gap-1">
      {visiveis.map((u, i) => (
        <div key={u + i} className="relative aspect-square overflow-hidden rounded-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u} alt="" className="h-full w-full object-cover" />
          {i === 3 && urls.length > 4 && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xl font-semibold text-white">+{urls.length - 4}</span>
          )}
        </div>
      ))}
    </div>
  );
}

interface Props {
  /** Nome no topo da conversa. */
  contato: string;
  /** Linha embaixo do nome ("online", "Conta comercial"). */
  subtitulo?: string;
  mensagens: MensagemPreview[];
  className?: string;
  /** Altura máxima da conversa em px (rola por dentro). */
  alturaMax?: number;
}

const URL_RE = /(https?:\/\/[^\s]+)/g;

/** *negrito*, _itálico_, ~riscado~ e links, como o WhatsApp mostra. Sem HTML cru. */
function formatar(texto: string): ReactNode[] {
  const nos: ReactNode[] = [];
  texto.split(URL_RE).forEach((parte, i) => {
    if (i % 2 === 1) {
      nos.push(
        <span key={`u${i}`} className="break-all text-[#027eb5] underline-offset-2 dark:text-[#53bdeb]">
          {parte}
        </span>
      );
      return;
    }
    const re = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;
    parte.split(re).forEach((pedaco, j) => {
      if (!pedaco) return;
      const k = `t${i}-${j}`;
      if (/^\*[^*\n]+\*$/.test(pedaco)) nos.push(<strong key={k} className="font-semibold">{pedaco.slice(1, -1)}</strong>);
      else if (/^_[^_\n]+_$/.test(pedaco)) nos.push(<em key={k}>{pedaco.slice(1, -1)}</em>);
      else if (/^~[^~\n]+~$/.test(pedaco)) nos.push(<s key={k}>{pedaco.slice(1, -1)}</s>);
      else nos.push(<Fragment key={k}>{pedaco}</Fragment>);
    });
  });
  return nos;
}

function horaAgora(): string {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Rabinho do balão (o mesmo desenho do WhatsApp Web). */
function Rabinho({ lado }: { lado: 'eu' | 'outro' }) {
  return lado === 'eu' ? (
    <svg viewBox="0 0 8 13" width="8" height="13" className="absolute -right-2 top-0 text-[#d9fdd3] dark:text-[#005c4b]" aria-hidden="true">
      <path fill="currentColor" d="M5.188 1H0v11.193l6.467-8.625C7.526 2.156 6.958 1 5.188 1z" />
    </svg>
  ) : (
    <svg viewBox="0 0 8 13" width="8" height="13" className="absolute -left-2 top-0 text-white dark:text-[#202c33]" aria-hidden="true">
      <path fill="currentColor" d="M1.533 3.568 8 12.193V1H2.812C1.042 1 .474 2.156 1.533 3.568z" />
    </svg>
  );
}

/** Dois tiques azuis (lida). */
function Lida() {
  return (
    <svg viewBox="0 0 16 11" width="16" height="11" aria-hidden="true" className="text-[#53bdeb]">
      <path
        fill="currentColor"
        d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.405-2.272a.463.463 0 0 0-.336-.146.47.47 0 0 0-.343.146l-.311.31a.445.445 0 0 0-.14.337c0 .136.047.25.14.343l2.996 2.996a.724.724 0 0 0 .501.203.697.697 0 0 0 .546-.266l6.646-8.417a.497.497 0 0 0 .108-.299.441.441 0 0 0-.19-.374l-.337-.273zm-2.992 8.137a.724.724 0 0 0 .501.203.697.697 0 0 0 .546-.266l6.646-8.417a.497.497 0 0 0 .108-.299.441.441 0 0 0-.19-.374l-.337-.273a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-.79-.746-.787 1.007 1.178 1.453z"
      />
    </svg>
  );
}

/**
 * Prévia de uma conversa do WhatsApp (celular Android): cabeçalho verde,
 * papel de parede, balões com rabinho, hora e tiques. É assim que a mensagem
 * aparece de verdade, para a pessoa não configurar no escuro.
 */
export function WhatsAppPreview({ contato, subtitulo = 'online', mensagens, className, alturaMax }: Props) {
  const hora = horaAgora();
  const conversaRef = useRef<HTMLDivElement>(null);
  // Conversa longa: mostra o fim, como o WhatsApp faz ao abrir.
  const assinatura = JSON.stringify(mensagens);
  useEffect(() => {
    const el = conversaRef.current;
    if (el && alturaMax) el.scrollTop = el.scrollHeight;
  }, [assinatura, alturaMax]);
  const iniciais = contato
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  return (
    <div
      className={cn(
        'mx-auto w-full max-w-[360px] overflow-hidden rounded-[28px] border-[6px] border-zinc-900 bg-zinc-900 shadow-xl dark:border-zinc-700',
        className
      )}
      role="img"
      aria-label={`Prévia no WhatsApp: conversa com ${contato}`}
    >
      {/* Cabeçalho */}
      <div className="flex items-center gap-2 bg-[#008069] px-2 py-2 text-white dark:bg-[#1f2c34]">
        <ArrowLeft className="h-5 w-5 shrink-0" />
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#dfe5e7] text-sm font-semibold text-[#54656f]">
          {iniciais || '?'}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[15px] font-medium">{contato}</p>
          <p className="truncate text-[12px] text-white/80">{subtitulo}</p>
        </div>
        <Video className="h-5 w-5 shrink-0" />
        <Phone className="ml-3 h-[18px] w-[18px] shrink-0" />
        <MoreVertical className="ml-2 h-5 w-5 shrink-0" />
      </div>

      {/* Conversa */}
      <div
        ref={conversaRef}
        className={cn('space-y-1.5 bg-[#efeae2] px-3 py-3 dark:bg-[#0b141a]', alturaMax && 'overflow-y-auto')}
        style={{
          backgroundImage:
            'radial-gradient(rgba(0,0,0,0.035) 1px, transparent 1px), radial-gradient(rgba(0,0,0,0.03) 1px, transparent 1px)',
          backgroundSize: '22px 22px, 31px 31px',
          backgroundPosition: '0 0, 11px 15px',
          minHeight: 260,
          ...(alturaMax ? { maxHeight: alturaMax } : {}),
        }}
      >
        <div className="mb-2 flex justify-center">
          <span className="rounded-md bg-white px-2.5 py-1 text-[11px] font-medium uppercase text-[#54656f] shadow-sm dark:bg-[#182229] dark:text-[#8696a0]">
            Hoje
          </span>
        </div>
        {mensagens.map((m, i) => {
          if (m.de === 'nota') {
            return (
              <div key={i} className="flex justify-center py-1">
                <span className="max-w-[88%] rounded-lg bg-[#fff5c4] px-3 py-1.5 text-center text-[12px] leading-snug text-[#54656f] shadow-sm dark:bg-[#182229] dark:text-[#ffd279]">
                  {m.texto}
                </span>
              </div>
            );
          }
          const eu = m.de === 'eu';
          const primeiraDoGrupo = i === 0 || mensagens[i - 1].de !== m.de;
          return (
            <div key={i} className={cn('flex', eu ? 'justify-end' : 'justify-start', primeiraDoGrupo && i > 0 && 'pt-1.5')}>
              <div
                className={cn(
                  'relative max-w-[85%] rounded-lg px-2.5 pb-1.5 pt-1.5 text-[14.2px] leading-[19px] text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] dark:text-[#e9edef]',
                  eu ? 'bg-[#d9fdd3] dark:bg-[#005c4b]' : 'bg-white dark:bg-[#202c33]',
                  primeiraDoGrupo && (eu ? 'rounded-tr-none' : 'rounded-tl-none')
                )}
              >
                {primeiraDoGrupo && <Rabinho lado={eu ? 'eu' : 'outro'} />}
                {m.imagens && m.imagens.length > 0 && <Fotos urls={m.imagens} />}
                <span className="whitespace-pre-wrap break-words">{formatar(m.texto)}</span>
                <span className="float-right ml-2 mt-1.5 flex translate-y-1 items-center gap-1 text-[11px] leading-none text-[#667781] dark:text-[#8696a0]">
                  {m.hora ?? hora}
                  {eu && <Lida />}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Barra de digitar */}
      <div className="flex items-center gap-1.5 bg-[#efeae2] px-1.5 pb-2 pt-1 dark:bg-[#0b141a]">
        <div className="flex h-10 flex-1 items-center gap-2 rounded-full bg-white px-3 text-[#8696a0] dark:bg-[#202c33]">
          <Smile className="h-5 w-5 shrink-0" />
          <span className="flex-1 text-[15px]">Mensagem</span>
          <Paperclip className="h-5 w-5 shrink-0 -rotate-45" />
          <Camera className="h-5 w-5 shrink-0" />
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white">
          <Mic className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

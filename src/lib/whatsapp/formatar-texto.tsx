import React from 'react'
import { renderTextWithLinks } from '@/lib/linkify'
import { tokenizarWhatsApp, type Trecho } from '@/lib/whatsapp/texto-whatsapp'

const MONO = 'rounded bg-black/5 px-1 font-mono text-[13px] dark:bg-white/10'

function renderTrechos(trechos: Trecho[], prefixo: string): React.ReactNode[] {
  return trechos.map((t, i) => {
    const key = `${prefixo}${i}`
    switch (t.tipo) {
      case 'texto':
        return <React.Fragment key={key}>{renderTextWithLinks(t.valor)}</React.Fragment>
      case 'bloco':
        return (
          <pre key={key} className={`my-1 whitespace-pre-wrap break-words py-1 ${MONO}`}>
            {t.valor}
          </pre>
        )
      case 'negrito':
        return (
          <strong key={key} className="font-semibold">
            {renderTrechos(t.filhos, `${key}.`)}
          </strong>
        )
      case 'italico':
        return <em key={key}>{renderTrechos(t.filhos, `${key}.`)}</em>
      case 'riscado':
        return <s key={key}>{renderTrechos(t.filhos, `${key}.`)}</s>
      case 'mono':
        return (
          <code key={key} className={MONO}>
            {renderTrechos(t.filhos, `${key}.`)}
          </code>
        )
    }
  })
}

/**
 * Texto de mensagem como o WhatsApp mostra: *negrito*, _italico_, ~riscado~,
 * `mono`, ```bloco```, links clicaveis e quebras de linha reais (inclusive
 * o "\n" literal que a IA manda).
 */
export function renderWhatsAppText(texto: string | null | undefined): React.ReactNode {
  if (!texto) return null
  return renderTrechos(tokenizarWhatsApp(texto), 'w')
}

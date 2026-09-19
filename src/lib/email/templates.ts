/**
 * Templates dos e-mails do sistema.
 *
 * Cada funcao devolve assunto, HTML e texto puro. Tudo que vem de fora (nome
 * de pessoa, nome do restaurante, comentario de cliente) passa por `escapar`
 * antes de entrar no HTML: comentario de avaliacao e texto livre digitado por
 * terceiros e nao pode virar marcacao dentro da caixa de entrada de ninguem.
 *
 * O estilo e todo inline porque cliente de e-mail ignora <style> e classes.
 */

const LARANJA = '#e65a1e'
const LARANJA_ESCURO = '#b64320'
const TEXTO = '#1f2937'
const TEXTO_SUAVE = '#6b7280'
const BORDA = '#e5e7eb'
const FUNDO = '#f6f7f9'

export interface EmailMontado {
  assunto: string
  html: string
  texto: string
}

/** Neutraliza HTML vindo de dado de usuario. */
export function escapar(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Moldura comum: cabecalho, corpo e rodape. `conteudo` ja vem escapado. */
function moldura(titulo: string, conteudo: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(titulo)}</title>
</head>
<body style="margin:0;padding:0;background:${FUNDO};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TEXTO};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FUNDO};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${BORDA};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,${LARANJA},${LARANJA_ESCURO});padding:20px 28px;">
              <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.2px;">Maya</span>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              ${conteudo}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 24px;border-top:1px solid ${BORDA};">
              <p style="margin:0;font-size:12px;line-height:1.5;color:${TEXTO_SUAVE};">
                Este e um e-mail automatico do Maya. Nao e preciso responder.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/** Botao principal. `url` sempre sai de link gerado pelo sistema. */
function botao(url: string, rotulo: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="background:${LARANJA};border-radius:8px;">
      <a href="${escapar(url)}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">${escapar(rotulo)}</a>
    </td>
  </tr>
</table>
<p style="margin:0 0 4px;font-size:12px;color:${TEXTO_SUAVE};">Se o botao nao abrir, copie e cole este endereco no navegador:</p>
<p style="margin:0;font-size:12px;word-break:break-all;"><a href="${escapar(url)}" style="color:${LARANJA_ESCURO};">${escapar(url)}</a></p>`
}

function paragrafo(texto: string): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;">${texto}</p>`
}

// ─── Recuperacao de senha ────────────────────────────────────

export function emailRecuperarSenha(params: {
  nome: string | null
  link: string
  validadeMinutos: number
}): EmailMontado {
  const { nome, link, validadeMinutos } = params
  const saudacao = nome ? `Ola, ${escapar(nome.split(' ')[0])}!` : 'Ola!'
  const validade =
    validadeMinutos >= 60
      ? `${Math.round(validadeMinutos / 60)} hora${Math.round(validadeMinutos / 60) > 1 ? 's' : ''}`
      : `${validadeMinutos} minutos`

  const html = moldura(
    'Redefinir senha',
    `<h1 style="margin:0 0 16px;font-size:20px;font-weight:700;">Redefinir sua senha</h1>
${paragrafo(saudacao)}
${paragrafo('Recebemos um pedido para trocar a senha da sua conta no Maya. Clique no botao abaixo para escolher uma nova.')}
${botao(link, 'Escolher nova senha')}
${paragrafo(`<strong>O link vale por ${escapar(validade)}</strong> e so pode ser usado uma vez.`)}
${paragrafo(`<span style="color:${TEXTO_SUAVE};font-size:14px;">Se nao foi voce quem pediu, pode ignorar este e-mail: sua senha continua a mesma.</span>`)}`
  )

  const texto = [
    saudacao.replace(/&#39;/g, "'"),
    '',
    'Recebemos um pedido para trocar a senha da sua conta no Maya.',
    'Abra o endereco abaixo para escolher uma nova:',
    link,
    '',
    `O link vale por ${validade} e so pode ser usado uma vez.`,
    'Se nao foi voce quem pediu, pode ignorar este e-mail: sua senha continua a mesma.',
  ].join('\n')

  return { assunto: 'Redefinir sua senha no Maya', html, texto }
}

// ─── Convite de acesso ───────────────────────────────────────

export function emailConvite(params: {
  nome: string | null
  restaurante: string
  link: string
  validadeDias: number
}): EmailMontado {
  const { nome, restaurante, link, validadeDias } = params
  const saudacao = nome ? `Ola, ${escapar(nome.split(' ')[0])}!` : 'Ola!'
  const casa = escapar(restaurante)

  const html = moldura(
    'Seu acesso ao Maya',
    `<h1 style="margin:0 0 16px;font-size:20px;font-weight:700;">Seu acesso ao Maya</h1>
${paragrafo(saudacao)}
${paragrafo(`Voce foi convidado para usar o Maya no <strong>${casa}</strong>. Para comecar, defina a sua senha:`)}
${botao(link, 'Definir minha senha')}
${paragrafo(`<strong>O convite vale por ${validadeDias} dia${validadeDias > 1 ? 's' : ''}.</strong> Depois disso, peca um novo para quem administra a conta.`)}`
  )

  const texto = [
    saudacao,
    '',
    `Voce foi convidado para usar o Maya no ${restaurante}.`,
    'Para comecar, defina a sua senha no endereco abaixo:',
    link,
    '',
    `O convite vale por ${validadeDias} dia${validadeDias > 1 ? 's' : ''}.`,
  ].join('\n')

  return { assunto: `Seu acesso ao Maya — ${restaurante}`, html, texto }
}

// ─── Relatorio de avaliacoes ─────────────────────────────────

export interface TemaDoRelatorio {
  tema: string
  total: number
  exemplos: string[]
}

export interface DadosRelatorio {
  restaurante: string
  /** Ex.: "08/09/2026 a 14/09/2026" */
  periodo: string
  total: number
  /** Media das notas, ja arredondada em uma casa. */
  media: number | null
  positivas: number
  neutras: number
  negativas: number
  elogios: TemaDoRelatorio[]
  reclamacoes: TemaDoRelatorio[]
  link: string
}

function listaDeTemas(titulo: string, cor: string, temas: TemaDoRelatorio[], vazio: string): string {
  if (temas.length === 0) {
    return `<h2 style="margin:24px 0 8px;font-size:15px;font-weight:700;">${escapar(titulo)}</h2>
${paragrafo(`<span style="color:${TEXTO_SUAVE};font-size:14px;">${escapar(vazio)}</span>`)}`
  }

  const itens = temas
    .map((t) => {
      const exemplo = t.exemplos[0]
        ? `<div style="margin-top:4px;font-size:13px;color:${TEXTO_SUAVE};font-style:italic;">&ldquo;${escapar(t.exemplos[0])}&rdquo;</div>`
        : ''
      return `<tr>
  <td style="padding:8px 0;border-bottom:1px solid ${BORDA};">
    <div style="font-size:15px;"><strong>${escapar(t.tema)}</strong> <span style="color:${TEXTO_SUAVE};">— ${t.total} menc${t.total === 1 ? 'ao' : 'oes'}</span></div>
    ${exemplo}
  </td>
</tr>`
    })
    .join('\n')

  return `<h2 style="margin:24px 0 8px;font-size:15px;font-weight:700;color:${cor};">${escapar(titulo)}</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${itens}
</table>`
}

export function emailRelatorioAvaliacoes(dados: DadosRelatorio): EmailMontado {
  const { restaurante, periodo, total, media, positivas, neutras, negativas, elogios, reclamacoes, link } = dados

  const resumo =
    total === 0
      ? paragrafo(
          `<span style="color:${TEXTO_SUAVE};">Nenhuma avaliacao foi registrada neste periodo.</span>`
        )
      : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 8px;border:1px solid ${BORDA};border-radius:10px;">
  <tr>
    <td style="padding:14px;text-align:center;border-right:1px solid ${BORDA};">
      <div style="font-size:22px;font-weight:700;">${total}</div>
      <div style="font-size:12px;color:${TEXTO_SUAVE};">avaliacoes</div>
    </td>
    <td style="padding:14px;text-align:center;border-right:1px solid ${BORDA};">
      <div style="font-size:22px;font-weight:700;">${media === null ? '—' : escapar(media.toFixed(1).replace('.', ','))}</div>
      <div style="font-size:12px;color:${TEXTO_SUAVE};">nota media</div>
    </td>
    <td style="padding:14px;text-align:center;">
      <div style="font-size:14px;font-weight:700;color:#15803d;">${positivas}</div>
      <div style="font-size:14px;font-weight:700;color:${TEXTO_SUAVE};">${neutras}</div>
      <div style="font-size:14px;font-weight:700;color:#b91c1c;">${negativas}</div>
      <div style="font-size:12px;color:${TEXTO_SUAVE};">pos / neu / neg</div>
    </td>
  </tr>
</table>`

  const html = moldura(
    'Resumo das avaliacoes',
    `<h1 style="margin:0 0 4px;font-size:20px;font-weight:700;">Resumo das avaliacoes</h1>
<p style="margin:0 0 16px;font-size:14px;color:${TEXTO_SUAVE};">${escapar(restaurante)} &middot; ${escapar(periodo)}</p>
${resumo}
${listaDeTemas('O que mais elogiaram', '#15803d', elogios, 'Sem elogios com comentario neste periodo.')}
${listaDeTemas('O que mais reclamaram', '#b91c1c', reclamacoes, 'Sem reclamacoes com comentario neste periodo. Otimo sinal.')}
${botao(link, 'Ver todas as avaliacoes')}`
  )

  const linhasTexto = (titulo: string, temas: TemaDoRelatorio[]) =>
    temas.length === 0
      ? [`${titulo}: nada registrado.`]
      : [`${titulo}:`, ...temas.map((t) => `  - ${t.tema} (${t.total})`)]

  const texto = [
    `Resumo das avaliacoes — ${restaurante}`,
    periodo,
    '',
    total === 0
      ? 'Nenhuma avaliacao foi registrada neste periodo.'
      : `${total} avaliacoes | nota media ${media === null ? '—' : media.toFixed(1).replace('.', ',')} | ${positivas} positivas, ${neutras} neutras, ${negativas} negativas`,
    '',
    ...linhasTexto('O que mais elogiaram', elogios),
    '',
    ...linhasTexto('O que mais reclamaram', reclamacoes),
    '',
    `Ver todas as avaliacoes: ${link}`,
  ].join('\n')

  return { assunto: `Avaliacoes de ${restaurante} — ${periodo}`, html, texto }
}

// ─── Teste de configuracao ───────────────────────────────────

export function emailTeste(params: { enviadoPor: string; quando: Date }): EmailMontado {
  const quando = params.quando.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  const html = moldura(
    'Teste de envio',
    `<h1 style="margin:0 0 16px;font-size:20px;font-weight:700;">SMTP funcionando</h1>
${paragrafo('Se voce esta lendo isto, o envio de e-mails do Maya esta configurado corretamente.')}
${paragrafo(`<span style="color:${TEXTO_SUAVE};font-size:14px;">Disparado por ${escapar(params.enviadoPor)} em ${escapar(quando)}.</span>`)}`
  )

  const texto = [
    'SMTP funcionando.',
    '',
    'Se voce esta lendo isto, o envio de e-mails do Maya esta configurado corretamente.',
    `Disparado por ${params.enviadoPor} em ${quando}.`,
  ].join('\n')

  return { assunto: 'Teste de envio do Maya', html, texto }
}

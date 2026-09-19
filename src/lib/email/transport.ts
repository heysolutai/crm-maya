import nodemailer, { type Transporter } from 'nodemailer'
import { lerSmtpConfig } from './config'

/**
 * Conexao SMTP compartilhada.
 *
 * `pool: true` reaproveita a conexao entre envios em vez de abrir uma por
 * e-mail — importante porque o relatorio semanal dispara varios de uma vez.
 */
let transporter: Transporter | null = null

function getTransporter(): Transporter | null {
  if (transporter) return transporter

  const cfg = lerSmtpConfig()
  if (!cfg) return null

  transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
    pool: true,
    maxConnections: 3,
    // Servidor lento nao pode segurar o worker pra sempre.
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })

  return transporter
}

/** Usado pelos testes e quando a config do ambiente muda. */
export function resetarTransporte(): void {
  transporter?.close()
  transporter = null
}

export interface EmailParaEnviar {
  para: string | string[]
  assunto: string
  html: string
  /** Versao em texto puro, pra cliente de e-mail que nao renderiza HTML. */
  texto: string
}

/**
 * Manda o e-mail pelo SMTP configurado.
 *
 * Lanca em qualquer falha — quem chama e o worker da fila, que cuida do
 * retry. Nao capture aqui: engolir o erro faria o job "dar certo" sem o
 * e-mail ter saido.
 */
export async function enviarEmail({ para, assunto, html, texto }: EmailParaEnviar): Promise<void> {
  const cfg = lerSmtpConfig()
  const transport = getTransporter()

  if (!cfg || !transport) {
    throw new Error('SMTP nao configurado (defina SMTP_HOST e SMTP_FROM)')
  }

  const destinatarios = Array.isArray(para) ? para : [para]
  if (destinatarios.length === 0) {
    throw new Error('E-mail sem destinatario')
  }

  await transport.sendMail({
    from: cfg.fromName ? `"${cfg.fromName}" <${cfg.from}>` : cfg.from,
    to: destinatarios.join(', '),
    subject: assunto,
    text: texto,
    html,
  })
}

/**
 * Traduz a falha do SMTP em algo que da pra mostrar na tela de diagnostico.
 *
 * O erro cru do nodemailer traz resposta do servidor, host e as vezes o
 * usuario; nada disso vai pro cliente. O que sai daqui e uma frase fixa
 * escolhida pelo codigo do erro.
 */
function motivoLegivel(erro: unknown): string {
  const codigo = (erro as { code?: string; responseCode?: number })?.code
  const respostaHttp = (erro as { responseCode?: number })?.responseCode

  switch (codigo) {
    case 'EAUTH':
      return 'Usuario ou senha do SMTP recusados pelo servidor'
    case 'ECONNREFUSED':
      return 'Conexao recusada: confira host e porta'
    case 'ETIMEDOUT':
    case 'ECONNECTION':
      return 'Nao foi possivel conectar ao servidor SMTP (tempo esgotado)'
    case 'EDNS':
    case 'ENOTFOUND':
      return 'Host do SMTP nao encontrado'
    case 'ESOCKET':
      return 'Falha de TLS: revise a porta e a opcao SMTP_SECURE'
    case 'EENVELOPE':
      return 'Remetente ou destinatario recusado pelo servidor'
    default:
      if (respostaHttp && respostaHttp >= 500) return 'O servidor SMTP recusou a mensagem'
      return 'Falha ao falar com o servidor SMTP'
  }
}

/**
 * Testa a conexao sem mandar mensagem. Para o card de diagnostico.
 */
export async function verificarSmtp(): Promise<{ ok: boolean; motivo?: string }> {
  const transport = getTransporter()
  if (!transport) {
    return { ok: false, motivo: 'SMTP nao configurado (defina SMTP_HOST e SMTP_FROM)' }
  }

  try {
    await transport.verify()
    return { ok: true }
  } catch (erro) {
    console.error('[Email] Falha ao verificar SMTP:', erro)
    return { ok: false, motivo: motivoLegivel(erro) }
  }
}

export { motivoLegivel }

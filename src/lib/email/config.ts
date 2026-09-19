/**
 * Configuracao do SMTP, lida do ambiente.
 *
 * E uma configuracao so pra plataforma inteira (nao por restaurante): os
 * e-mails que saem daqui sao do sistema — recuperar senha, convite de acesso e
 * o relatorio de avaliacoes. Se as variaveis nao estiverem preenchidas, o
 * envio simplesmente nao acontece e o resto do CRM continua funcionando.
 */

export interface SmtpConfig {
  host: string
  port: number
  /** TLS direto na conexao (porta 465). Na 587 o STARTTLS e negociado depois. */
  secure: boolean
  user?: string
  pass?: string
  /** Endereco que aparece como remetente. */
  from: string
  /** Nome exibido junto do remetente. */
  fromName: string
}

/** Config do SMTP, ou null quando o minimo (host + remetente) nao foi preenchido. */
export function lerSmtpConfig(): SmtpConfig | null {
  const host = (process.env.SMTP_HOST || '').trim()
  const user = (process.env.SMTP_USER || '').trim()
  const from = (process.env.SMTP_FROM || user).trim()

  if (!host || !from) return null

  const port = parseInt(process.env.SMTP_PORT || '587', 10) || 587
  const secureEnv = (process.env.SMTP_SECURE || '').trim().toLowerCase()

  return {
    host,
    port,
    // Sem SMTP_SECURE explicito, a porta decide: 465 e TLS direto, o resto nao.
    secure: secureEnv ? secureEnv === 'true' || secureEnv === '1' : port === 465,
    user: user || undefined,
    pass: process.env.SMTP_PASS || undefined,
    from,
    fromName: (process.env.SMTP_FROM_NAME || 'Maya').trim(),
  }
}

export function emailConfigurado(): boolean {
  return lerSmtpConfig() !== null
}

/**
 * Base pros links que vao no e-mail.
 *
 * Sem barra no fim, pra quem usa so concatenar o caminho.
 */
export function urlDaAplicacao(): string {
  const bruto = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:7001'
  return bruto.replace(/\/+$/, '')
}

/**
 * Resumo da config pra tela de diagnostico do super admin.
 *
 * A senha NUNCA sai daqui, nem mascarada com o tamanho real: so o fato de
 * existir ou nao.
 */
export function resumoSmtp(): {
  configurado: boolean
  host: string | null
  port: number | null
  secure: boolean | null
  remetente: string | null
  autenticado: boolean
} {
  const cfg = lerSmtpConfig()
  if (!cfg) {
    return { configurado: false, host: null, port: null, secure: null, remetente: null, autenticado: false }
  }
  return {
    configurado: true,
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    remetente: cfg.fromName ? `${cfg.fromName} <${cfg.from}>` : cfg.from,
    autenticado: Boolean(cfg.user && cfg.pass),
  }
}

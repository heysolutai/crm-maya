/**
 * Tradutor de erros de envio/conexao do WhatsApp pra linguagem do restaurante.
 *
 * Os erros chegam crus de varios lugares (UazAPI, Evolution, WhatsApp Cloud /
 * Covercut, o proprio CRM): "Nao foi possivel conectar ao servidor UazAPI",
 * "API error: 401", "fetch failed", codigo 131047 da Meta... O restaurante nao
 * entende nenhum. Aqui cada um vira: uma frase do que aconteceu, o que fazer e
 * se adianta tentar de novo. O texto cru continua guardado (e o super-admin ve)
 * pra quem depura.
 *
 * Arquivo sem dependencias de servidor: pode ser importado pela tela.
 */

export type CodigoFalha =
  | 'whatsapp_fora'
  | 'whatsapp_desconectado'
  | 'janela_24h'
  | 'numero_invalido'
  | 'arquivo_invalido'
  | 'limite'
  | 'ia_pausada'
  | 'desconhecido'

export interface FalhaExplicada {
  codigo: CodigoFalha
  /** O que aconteceu, em uma frase simples. */
  motivo: string
  /** O que o restaurante pode fazer. */
  oQueFazer: string
  /** Tentar de novo agora tem chance de dar certo. */
  podeTentarDeNovo: boolean
}

const REGRAS: Array<{ codigo: CodigoFalha; teste: RegExp; explicacao: Omit<FalhaExplicada, 'codigo'> }> = [
  {
    codigo: 'ia_pausada',
    teste: /AI_PAUSED|ia pausada/i,
    explicacao: {
      motivo: 'A IA estava pausada para este cliente, então a resposta dela não foi enviada.',
      oQueFazer: 'Se a IA deve voltar a atender, clique em "Retomar IA" no topo da conversa.',
      podeTentarDeNovo: false,
    },
  },
  {
    codigo: 'janela_24h',
    teste: /24\s?h|janela|131047|re-?engagement|template/i,
    explicacao: {
      motivo:
        'No WhatsApp oficial, depois de 24 horas sem o cliente escrever, só dá para mandar mensagens aprovadas.',
      oQueFazer: 'Espere o cliente mandar uma mensagem e responda logo em seguida.',
      podeTentarDeNovo: false,
    },
  },
  {
    codigo: 'numero_invalido',
    teste: /131026|invalid.{0,12}(phone|number|recipient)|n[uú]mero inv[aá]lido|not.{0,6}whatsapp|n[aã]o tem whatsapp|not on whatsapp|recipient.{0,20}not/i,
    explicacao: {
      motivo: 'Este número não tem WhatsApp ou está escrito errado.',
      oQueFazer: 'Confira o telefone do cliente no cadastro.',
      podeTentarDeNovo: false,
    },
  },
  {
    codigo: 'whatsapp_desconectado',
    teste:
      /\b40[13]\b|unauthori[sz]ed|n[aã]o autorizado|authentication failed|invalid.?credentials|token (inv[aá]lido|expirado)|desconectad|disconnected|logged ?out|not connected|n[aã]o conectad|ACCOUNT_OFFBOARDED|instance.{0,10}not found|inst[aâ]ncia.{0,10}n[aã]o (encontrada|existe)/i,
    explicacao: {
      motivo: 'O WhatsApp deste número está desconectado.',
      oQueFazer: 'Abra Conexões, entre no número e conecte de novo (QR Code ou botão Conectar).',
      podeTentarDeNovo: false,
    },
  },
  {
    codigo: 'limite',
    teste: /\b429\b|rate.?limit|too many|limite de envio|muitas mensagens/i,
    explicacao: {
      motivo: 'Muitas mensagens em pouco tempo: o WhatsApp segurou o envio.',
      oQueFazer: 'Espere alguns minutos e tente de novo.',
      podeTentarDeNovo: true,
    },
  },
  {
    codigo: 'whatsapp_fora',
    teste:
      /conectar ao servidor|fetch failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket|network|rede|timeout|tempo esgotado|indispon[ií]vel|fora do ar|\b50[0234]\b|offline|unreachable/i,
    explicacao: {
      motivo: 'Não conseguimos falar com o WhatsApp deste número agora (servidor fora do ar ou sem internet).',
      oQueFazer: 'Tente de novo em alguns minutos. Se continuar, confira o número em Conexões.',
      podeTentarDeNovo: true,
    },
  },
  {
    codigo: 'arquivo_invalido',
    teste: /url p[uú]blica|link p[uú]blico|m[ií]dia|\bmedia\b|unsupported|formato|mime|arquivo/i,
    explicacao: {
      motivo: 'O arquivo não pôde ser enviado (formato não aceito ou endereço inválido).',
      oQueFazer: 'Tente enviar outro arquivo, em JPG, PNG ou PDF.',
      podeTentarDeNovo: false,
    },
  },
]

const DESCONHECIDO: Omit<FalhaExplicada, 'codigo'> = {
  motivo: 'A mensagem não foi entregue ao cliente.',
  oQueFazer: 'Tente de novo. Se continuar, fale com o suporte.',
  podeTentarDeNovo: true,
}

/** Erro cru (de qualquer canal) -> explicacao pro restaurante. */
export function explicarFalhaEnvio(raw: string | null | undefined): FalhaExplicada {
  const texto = (raw || '').trim()
  if (texto) {
    for (const r of REGRAS) {
      if (r.teste.test(texto)) return { codigo: r.codigo, ...r.explicacao }
    }
  }
  return { codigo: 'desconhecido', ...DESCONHECIDO }
}

/**
 * Erro da CONEXAO (status da inbox, "ultimo erro do provider") -> explicacao.
 * Mesma traducao; sem erro reconhecivel, uma frase neutra.
 */
export function explicarErroConexao(raw: string | null | undefined): Omit<FalhaExplicada, 'podeTentarDeNovo'> {
  const e = explicarFalhaEnvio(raw)
  if (e.codigo === 'desconhecido') {
    return {
      codigo: 'desconhecido',
      motivo: 'O WhatsApp deste número teve um problema na última tentativa de conexão.',
      oQueFazer: 'Tente conectar de novo. Se continuar, fale com o suporte.',
    }
  }
  return { codigo: e.codigo, motivo: e.motivo, oQueFazer: e.oQueFazer }
}

/** Texto cru da falha guardado numa mensagem (metadata), se houver. */
export function falhaDaMensagem(
  metadata: unknown,
  readStatus?: string | null
): string | null {
  const m = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {}
  for (const k of ['send_error', 'whatsapp_error'] as const) {
    const v = m[k]
    if (typeof v === 'string' && v.trim()) return v
  }
  return readStatus === 'failed' ? 'failed' : null
}

/** Tamanho maximo do texto cru guardado em metadata.send_error. */
export const LIMITE_ERRO_ENVIO = 500

/** Marcadores de falha de envio que ficam no metadata da mensagem. */
export const CHAVES_FALHA_ENVIO = ['send_error', 'whatsapp_error', 'failed_at'] as const

/** Erro de qualquer forma (Error, texto, objeto) -> texto cru curto pra send_error. Nunca vazio. */
export function textoDaFalhaEnvio(erro: unknown): string {
  let texto = ''
  if (typeof erro === 'string') texto = erro
  else if (erro instanceof Error) texto = erro.message
  else if (erro && typeof erro === 'object') {
    const msg = (erro as { message?: unknown }).message
    if (typeof msg === 'string') texto = msg
  }
  texto = texto.trim()
  return (texto || 'erro desconhecido').slice(0, LIMITE_ERRO_ENVIO)
}

/** Metadata sem os marcadores de falha (o envio deu certo depois). */
export function semFalhaDeEnvio(metadata: unknown): Record<string, unknown> {
  const m: Record<string, unknown> =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {}
  for (const k of CHAVES_FALHA_ENVIO) delete m[k]
  return m
}

/**
 * Da pra mandar ESTA mensagem de novo como esta? Texto com conteudo, ou
 * imagem/documento com link https (audio, video etc. ficam de fora).
 */
export function mensagemReenviavel(m: {
  messageType?: string | null
  messageText?: string | null
  mediaUrl?: string | null
}): boolean {
  const tipo = (m.messageType || 'text').toLowerCase()
  if (tipo === 'text') return !!(m.messageText || '').trim()
  if (tipo === 'image' || tipo === 'document') return /^https:\/\/\S+$/i.test((m.mediaUrl || '').trim())
  return false
}

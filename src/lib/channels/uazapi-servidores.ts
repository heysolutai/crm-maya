/**
 * Servidores UazAPI conhecidos, oferecidos no "Usar token existente" da
 * criacao de conexao. O padrao (Heysolut) vem do ambiente; o NicoChat
 * tambem e UazAPI e tem instancias de restaurantes em mapeamento/migracao.
 * Endereco de servidor nao e segredo: pode ir pro navegador.
 */

export interface ServidorUazapi {
  nome: string
  url: string
  /** O que ja vem preenchido (UAZAPI_BASE_URL). */
  padrao: boolean
}

export const NICOCHAT_UAZAPI_URL = 'https://nicochat.uazapi.com'

const semBarraFinal = (url: string) => url.trim().replace(/\/+$/, '')

export function servidoresUazapi(): ServidorUazapi[] {
  const padrao = semBarraFinal(process.env.UAZAPI_BASE_URL || '')
  const lista: ServidorUazapi[] = []
  if (padrao) lista.push({ nome: 'Heysolut', url: padrao, padrao: true })
  if (padrao !== NICOCHAT_UAZAPI_URL) lista.push({ nome: 'NicoChat', url: NICOCHAT_UAZAPI_URL, padrao: false })
  return lista
}

/**
 * Instancia adotada num servidor que NAO e o padrao (ex.: NicoChat): o que
 * sai "via API" pode ser do robo ou dos atendentes do outro sistema, e o CRM
 * grava pra mapear a conversa. Devolve o nome do sistema pra mostrar na
 * conversa, ou null (instancia nossa, ou adotada no proprio servidor padrao:
 * comportamento de sempre).
 */
export function sistemaDeOrigem(apiUrl: string | null, adotada: boolean): string | null {
  if (!adotada || !apiUrl) return null
  const url = semBarraFinal(apiUrl)
  const conhecido = servidoresUazapi().find((s) => s.url === url)
  if (conhecido?.padrao) return null
  if (conhecido) return conhecido.nome
  try {
    return new URL(url).hostname
  } catch {
    return 'outro sistema'
  }
}

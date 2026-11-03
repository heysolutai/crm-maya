import { createHash } from 'node:crypto'
import { assertSafeUrl, IntegrationHttpError } from './http'

/**
 * Cliente MCP (Model Context Protocol) pelo transporte Streamable HTTP: o CRM
 * conecta num servidor MCP (endereco + chave), descobre as ferramentas
 * (tools/list) e a IA chama (tools/call) conforme a conversa pede.
 *
 * Mesma protecao das integracoes HTTP (assertSafeUrl): so https, nunca rede
 * interna, sem seguir redirect. Respostas em JSON ou em SSE (text/event-stream).
 * A sessao (Mcp-Session-Id) e reaproveitada por alguns minutos por servidor e
 * cabecalhos (ou seja, por cliente, quando o telefone vai no cabecalho).
 */

const VERSAO_PROTOCOLO = '2025-06-18'
const TIMEOUT_MS = 20_000
const MAX_BYTES = 1_000_000
const SESSAO_TTL_MS = 10 * 60 * 1000
const MAX_PAGINAS = 10

export interface McpTool {
  name: string
  title?: string
  description?: string
  inputSchema: Record<string, unknown>
  annotations?: { title?: string; readOnlyHint?: boolean; destructiveHint?: boolean }
}

export interface McpResultado {
  texto: string
  isError: boolean
}

/** Erro devolvido pelo servidor MCP (JSON-RPC error). */
export class ErroRpcMcp extends Error {
  constructor(
    readonly codigo: number,
    message: string
  ) {
    super(message)
    this.name = 'ErroRpcMcp'
  }
}

interface Sessao {
  id: string | null
  versao: string
  criadaEm: number
}

type Json = Record<string, unknown>

interface MensagemRpc {
  id?: string | number | null
  result?: unknown
  error?: { code?: number; message?: string }
}

const sessoes = new Map<string, Sessao>()
let proximoId = 1

function chaveSessao(url: string, headers: Record<string, string>): string {
  // Chave do cache sem guardar o segredo em claro.
  return createHash('sha256').update(url).update(JSON.stringify(headers)).digest('hex')
}

function obj(v: unknown): Json | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null
}

/** Le o corpo (JSON ou SSE) e devolve a resposta JSON-RPC com o `id` pedido. */
async function lerResposta(res: Response, id: number): Promise<MensagemRpc | null> {
  const tipo = (res.headers.get('content-type') || '').toLowerCase()

  if (!tipo.includes('text/event-stream')) {
    const texto = (await res.text()).slice(0, MAX_BYTES)
    if (!texto.trim()) return null
    let dado: unknown
    try {
      dado = JSON.parse(texto)
    } catch {
      throw new IntegrationHttpError('Servidor MCP respondeu algo que nao e JSON', res.status, texto.slice(0, 300))
    }
    const lista = Array.isArray(dado) ? dado : [dado]
    return (lista.find((m) => obj(m)?.id === id) as MensagemRpc | undefined) ?? null
  }

  // SSE: eventos separados por linha em branco; cada "data:" e um JSON-RPC.
  if (!res.body) return null
  const leitor = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let lidos = 0
  try {
    for (;;) {
      const { value, done } = await leitor.read()
      if (done) break
      lidos += value.byteLength
      if (lidos > MAX_BYTES) throw new IntegrationHttpError('Resposta do servidor MCP grande demais')
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      let fim: number
      while ((fim = buffer.indexOf('\n\n')) >= 0) {
        const evento = buffer.slice(0, fim)
        buffer = buffer.slice(fim + 2)
        const dados = evento
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart())
          .join('\n')
        if (!dados) continue
        try {
          const m = JSON.parse(dados) as MensagemRpc
          if (m && m.id === id) return m
        } catch {
          // evento que nao e JSON (ping): ignora
        }
      }
    }
  } finally {
    leitor.cancel().catch(() => {})
  }
  return null
}

async function postar(
  url: URL,
  headers: Record<string, string>,
  corpo: Json,
  sessao: Sessao | null
): Promise<{ status: number; sessionId: string | null; resposta: MensagemRpc | null }> {
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(sessao?.id ? { 'Mcp-Session-Id': sessao.id } : {}),
        ...(sessao ? { 'MCP-Protocol-Version': sessao.versao } : {}),
      },
      body: JSON.stringify(corpo),
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    const msg = (err as Error)?.name === 'TimeoutError' ? 'tempo esgotado' : 'falha de rede'
    throw new IntegrationHttpError(`Sistema externo indisponivel (${msg})`)
  }

  if (res.status >= 300 && res.status < 400) {
    throw new IntegrationHttpError('Sistema externo respondeu com redirecionamento (bloqueado)', res.status)
  }
  const sessionId = res.headers.get('mcp-session-id')
  if (res.status === 202) return { status: 202, sessionId, resposta: null }
  if (!res.ok) {
    const corpoErro = (await res.text().catch(() => '')).slice(0, 500)
    throw new IntegrationHttpError(`Sistema externo respondeu ${res.status}`, res.status, corpoErro)
  }
  const id = typeof corpo.id === 'number' ? corpo.id : -1
  try {
    return { status: res.status, sessionId, resposta: await lerResposta(res, id) }
  } catch (err) {
    if (err instanceof IntegrationHttpError) throw err
    const msg = (err as Error)?.name === 'TimeoutError' ? 'tempo esgotado' : 'falha de rede'
    throw new IntegrationHttpError(`Sistema externo indisponivel (${msg})`)
  }
}

function resultadoOuErro(resposta: MensagemRpc | null): unknown {
  if (!resposta) throw new IntegrationHttpError('Servidor MCP nao respondeu ao pedido')
  if (resposta.error) {
    throw new ErroRpcMcp(Number(resposta.error.code ?? 0), String(resposta.error.message ?? 'erro do servidor MCP'))
  }
  return resposta.result
}

async function abrirSessao(url: URL, headers: Record<string, string>): Promise<Sessao> {
  const id = proximoId++
  const r = await postar(
    url,
    headers,
    {
      jsonrpc: '2.0',
      id,
      method: 'initialize',
      params: {
        protocolVersion: VERSAO_PROTOCOLO,
        capabilities: {},
        clientInfo: { name: 'maya-crm', version: '1.0.0' },
      },
    },
    null
  )
  const result = obj(resultadoOuErro(r.resposta))
  const versao = typeof result?.protocolVersion === 'string' ? result.protocolVersion : VERSAO_PROTOCOLO
  const sessao: Sessao = { id: r.sessionId, versao, criadaEm: Date.now() }
  // Avisa que terminou de iniciar (notificacao: sem resposta).
  await postar(url, headers, { jsonrpc: '2.0', method: 'notifications/initialized' }, sessao).catch(() => {})
  return sessao
}

/** Uma chamada JSON-RPC, abrindo (ou reabrindo, se expirou) a sessao. */
async function chamar(rawUrl: string, headers: Record<string, string>, method: string, params: Json): Promise<unknown> {
  const url = await assertSafeUrl(rawUrl)
  const chave = chaveSessao(url.toString(), headers)

  for (let tentativa = 0; tentativa < 2; tentativa++) {
    let sessao = sessoes.get(chave) ?? null
    if (!sessao || Date.now() - sessao.criadaEm > SESSAO_TTL_MS) {
      sessao = await abrirSessao(url, headers)
      // Uma sessao por cliente (o telefone vai no cabecalho): sem isto as
      // vencidas ficavam no Map pra sempre.
      for (const [k, s] of sessoes) if (Date.now() - s.criadaEm > SESSAO_TTL_MS) sessoes.delete(k)
      sessoes.set(chave, sessao)
    }
    try {
      const r = await postar(url, headers, { jsonrpc: '2.0', id: proximoId++, method, params }, sessao)
      return resultadoOuErro(r.resposta)
    } catch (err) {
      // Sessao vencida no servidor (404/400): abre outra e tenta uma vez mais.
      const status = err instanceof IntegrationHttpError ? err.status : undefined
      sessoes.delete(chave)
      if (tentativa === 0 && sessao.id && (status === 404 || status === 400)) continue
      throw err
    }
  }
  throw new IntegrationHttpError('Servidor MCP nao respondeu ao pedido')
}

function comoTool(v: unknown): McpTool | null {
  const t = obj(v)
  if (!t || typeof t.name !== 'string' || !t.name.trim()) return null
  const schema = obj(t.inputSchema) ?? { type: 'object', properties: {} }
  const annotations = obj(t.annotations)
  return {
    name: t.name.trim(),
    title: typeof t.title === 'string' ? t.title : undefined,
    description: typeof t.description === 'string' ? t.description : undefined,
    inputSchema: schema,
    annotations: annotations
      ? {
          title: typeof annotations.title === 'string' ? annotations.title : undefined,
          readOnlyHint: typeof annotations.readOnlyHint === 'boolean' ? annotations.readOnlyHint : undefined,
          destructiveHint: typeof annotations.destructiveHint === 'boolean' ? annotations.destructiveHint : undefined,
        }
      : undefined,
  }
}

/** Ferramentas que o servidor oferece (todas as paginas). */
export async function mcpListarFerramentas(url: string, headers: Record<string, string>): Promise<McpTool[]> {
  const tools: McpTool[] = []
  let cursor: string | undefined
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const result = obj(await chamar(url, headers, 'tools/list', cursor ? { cursor } : {}))
    const lista = Array.isArray(result?.tools) ? result.tools : []
    for (const item of lista) {
      const t = comoTool(item)
      if (t) tools.push(t)
    }
    cursor = typeof result?.nextCursor === 'string' && result.nextCursor ? result.nextCursor : undefined
    if (!cursor) break
  }
  return tools
}

/** Chama uma ferramenta e junta o conteudo em texto pra IA. */
export async function mcpChamarFerramenta(
  url: string,
  headers: Record<string, string>,
  nome: string,
  args: Record<string, unknown>
): Promise<McpResultado> {
  const result = obj(await chamar(url, headers, 'tools/call', { name: nome, arguments: args }))
  const conteudo = Array.isArray(result?.content) ? result.content : []
  const partes: string[] = []
  for (const c of conteudo) {
    const item = obj(c)
    if (!item) continue
    if (item.type === 'text' && typeof item.text === 'string') partes.push(item.text)
    else if (item.type === 'resource') {
      const r = obj(item.resource)
      if (typeof r?.text === 'string') partes.push(r.text)
      else if (typeof r?.uri === 'string') partes.push(`[recurso: ${r.uri}]`)
    } else if (item.type === 'resource_link' && typeof item.uri === 'string') partes.push(`[link: ${item.uri}]`)
    else if (item.type === 'image') partes.push('[imagem]')
  }
  let texto = partes.join('\n').trim()
  if (!texto && result?.structuredContent !== undefined) texto = JSON.stringify(result.structuredContent)
  return { texto: texto.slice(0, 8000), isError: result?.isError === true }
}

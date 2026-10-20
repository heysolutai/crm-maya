import type { FunctionDefinition } from '@/lib/ai-tools/types'
import { modeloAceitaTemperatura } from './config'
import type { MensagemChat } from './historico'

/**
 * Conversa com o modelo (OpenAI Chat Completions) com function calling.
 *
 * Sem SDK de proposito: e uma chamada so, e o fetch nativo deixa timeout e
 * retry explicitos aqui. Nenhuma regra de negocio mora neste arquivo: quem
 * executa as ferramentas e o chamador (`executar`), o loop so as encadeia.
 *
 * Limites:
 *   - ate 6 rodadas de ferramenta; passou disso, a proxima chamada vai SEM
 *     ferramentas pra forcar texto (o cliente nunca fica sem resposta);
 *   - ~90 s no total (cada chamada ao modelo tem teto de 45 s);
 *   - 1 retry, so pro que e transitorio (429 de limite de taxa, 5xx, rede,
 *     timeout). 401/403, cota esgotada e 4xx de pedido nao melhoram repetindo.
 *
 * Nunca loga a chave, o prompt nem o corpo da resposta: o prompt tem dados do
 * cliente e a chave e do restaurante. Erro vira codigo curto (status).
 */

// OPENAI_BASE_URL opcional (proxy compativel, ou servidor falso em teste local).
const URL_OPENAI = `${(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')}/chat/completions`
export const MAX_RODADAS_TOOL = 6
export const PRAZO_TOTAL_MS = 90_000
const TIMEOUT_CHAMADA_MS = 45_000
const BACKOFF_MS = 800
const BACKOFF_MAX_MS = 3_000
const LIMITE_RESULTADO_TOOL = 4_000

// ─── Formato da OpenAI (so o que usamos) ────────────────────────────────────

interface ToolCallOpenAI {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

type MensagemOpenAI =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCallOpenAI[] }
  | { role: 'tool'; content: string; tool_call_id: string }

interface RespostaOpenAI {
  choices?: { message?: { content?: string | null; tool_calls?: unknown } }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

// ─── Tipos publicos ─────────────────────────────────────────────────────────

export interface ChamadaTool {
  id: string
  nome: string
  /** JSON cru como o modelo mandou (o executor valida). */
  argsBrutos: string
}

export interface ResultadoFerramenta {
  ok: boolean
  /** Texto devolvido ao modelo. */
  texto: string
  /** true = a conversa acabou nesta ferramenta (ex: transferiu pra humano): a proxima volta e so texto. */
  encerra?: boolean
  /** true = nao rodou de verdade (playground). */
  simulada?: boolean
}

export interface RegistroChamada {
  nome: string
  args: Record<string, unknown>
  ok: boolean
  resultado: string
  ms: number
  simulada: boolean
}

export type CodigoErroModelo = 'sem_chave' | 'chave_recusada' | 'sem_saldo' | 'tempo' | 'rede' | 'http' | 'resposta_invalida'

export class ErroModelo extends Error {
  /** Retry-After da OpenAI (segundos), quando ela mandou. */
  esperaS?: number

  constructor(
    message: string,
    readonly codigo: CodigoErroModelo,
    readonly repetir: boolean,
    readonly status?: number
  ) {
    super(message)
    this.name = 'ErroModelo'
  }
}

export interface ParamsConversa {
  apiKey: string
  modelo: string
  /** null = nao enviar (modelo de raciocinio). */
  temperatura: number | null
  system: string
  historico: MensagemChat[]
  tools: FunctionDefinition[]
  executar: (chamada: ChamadaTool) => Promise<ResultadoFerramenta>
  maxRodadas?: number
  prazoMs?: number
}

export interface ResultadoConversa {
  texto: string
  chamadas: RegistroChamada[]
  uso: { entrada: number; saida: number }
  /** Chamadas ao modelo feitas (1 = respondeu direto). */
  voltas: number
  /** Alguma ferramenta pediu pra encerrar (ex: transferir_para_humano ok). */
  encerrou: boolean
}

// ─── Leitura da resposta ────────────────────────────────────────────────────

/** tool_calls cru da OpenAI -> ChamadaTool[]. Exportado pra teste. */
export function lerChamadas(bruto: unknown): ChamadaTool[] {
  if (!Array.isArray(bruto)) return []
  const chamadas: ChamadaTool[] = []
  for (const item of bruto) {
    if (!item || typeof item !== 'object') continue
    const tc = item as { id?: unknown; function?: { name?: unknown; arguments?: unknown } }
    const nome = typeof tc.function?.name === 'string' ? tc.function.name : ''
    if (!nome) continue
    const args = tc.function?.arguments
    chamadas.push({
      id: typeof tc.id === 'string' && tc.id ? tc.id : `call_${chamadas.length}`,
      nome,
      argsBrutos: typeof args === 'string' ? args : args && typeof args === 'object' ? JSON.stringify(args) : '{}',
    })
  }
  return chamadas
}

/** Args como objeto, so pra registro/tela; JSON invalido vira {}. */
export function argsComoObjeto(bruto: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(bruto || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

// ─── Chamada HTTP ───────────────────────────────────────────────────────────

/** Codigo do erro da OpenAI (ex: insufficient_quota): curto e sem dado sensivel. */
async function codigoDoErro(res: Response): Promise<string> {
  try {
    const corpo = (await res.json()) as { error?: { code?: unknown; type?: unknown } }
    const codigo = corpo?.error?.code ?? corpo?.error?.type
    if (typeof codigo === 'string' && /^[a-z0-9_.-]{1,60}$/i.test(codigo)) return codigo
  } catch {
    // corpo nao-JSON: fica so o status
  }
  return ''
}

function segundosDeEspera(res: Response): number | null {
  const v = Number(res.headers.get('retry-after'))
  return Number.isFinite(v) && v > 0 ? v : null
}

async function umaTentativa(
  corpo: string,
  apiKey: string,
  timeoutMs: number
): Promise<{ texto: string; chamadas: ChamadaTool[]; uso: { entrada: number; saida: number } }> {
  let res: Response
  try {
    res = await fetch(URL_OPENAI, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: corpo,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    const nome = (e as Error)?.name
    if (nome === 'TimeoutError' || nome === 'AbortError') throw new ErroModelo('modelo: tempo esgotado', 'tempo', true)
    throw new ErroModelo('modelo: falha de rede', 'rede', true)
  }

  if (!res.ok) {
    const codigo = await codigoDoErro(res)
    const sufixo = codigo ? ` (${codigo})` : ''
    if (res.status === 401 || res.status === 403) {
      throw new ErroModelo(`modelo: HTTP ${res.status}${sufixo}`, 'chave_recusada', false, res.status)
    }
    if (res.status === 429 && /quota|billing/i.test(codigo)) {
      throw new ErroModelo(`modelo: HTTP 429${sufixo}`, 'sem_saldo', false, 429)
    }
    const repetir = res.status === 429 || res.status >= 500
    const e = new ErroModelo(`modelo: HTTP ${res.status}${sufixo}`, 'http', repetir, res.status)
    e.esperaS = segundosDeEspera(res) ?? undefined
    throw e
  }

  let json: RespostaOpenAI
  try {
    json = (await res.json()) as RespostaOpenAI
  } catch {
    throw new ErroModelo('modelo: resposta invalida', 'resposta_invalida', true)
  }
  const msg = json.choices?.[0]?.message
  if (!msg) throw new ErroModelo('modelo: resposta sem mensagem', 'resposta_invalida', true)

  return {
    texto: typeof msg.content === 'string' ? msg.content : '',
    chamadas: lerChamadas(msg.tool_calls),
    uso: {
      entrada: Number(json.usage?.prompt_tokens) || 0,
      saida: Number(json.usage?.completion_tokens) || 0,
    },
  }
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Uma chamada ao modelo com 1 retry nos erros transitorios, respeitando o prazo total. */
async function chamarModelo(
  p: Pick<ParamsConversa, 'apiKey' | 'modelo' | 'temperatura'>,
  mensagens: MensagemOpenAI[],
  tools: FunctionDefinition[],
  prazo: number
) {
  const corpo: Record<string, unknown> = { model: p.modelo, messages: mensagens }
  if (p.temperatura !== null && modeloAceitaTemperatura(p.modelo)) corpo.temperature = p.temperatura
  // A OpenAI recusa tool_choice sem tools: a volta final (so texto) vai sem as duas.
  if (tools.length > 0) {
    corpo.tools = tools
    corpo.tool_choice = 'auto'
  }
  const json = JSON.stringify(corpo)

  const restante = () => prazo - Date.now()
  const tempoDaChamada = () => Math.min(TIMEOUT_CHAMADA_MS, restante())

  if (tempoDaChamada() < 2_000) throw new ErroModelo('modelo: tempo esgotado', 'tempo', false)
  try {
    return await umaTentativa(json, p.apiKey, tempoDaChamada())
  } catch (e) {
    if (!(e instanceof ErroModelo) || !e.repetir) throw e
    const espera = Math.min(BACKOFF_MAX_MS, e.esperaS ? e.esperaS * 1000 : BACKOFF_MS)
    console.warn(`[maestro/llm] ${e.message}: repetindo uma vez`)
    if (restante() < espera + 2_000) throw e
    await dormir(espera)
    return umaTentativa(json, p.apiKey, tempoDaChamada())
  }
}

// ─── Loop modelo <-> ferramentas ────────────────────────────────────────────

export async function conversar(p: ParamsConversa): Promise<ResultadoConversa> {
  if (!p.apiKey) throw new ErroModelo('modelo: sem chave de API', 'sem_chave', false)

  const maxRodadas = p.maxRodadas ?? MAX_RODADAS_TOOL
  const prazo = Date.now() + (p.prazoMs ?? PRAZO_TOTAL_MS)

  const mensagens: MensagemOpenAI[] = [
    { role: 'system', content: p.system },
    ...p.historico.map((m): MensagemOpenAI => ({ role: m.role, content: m.content })),
  ]
  const chamadas: RegistroChamada[] = []
  const uso = { entrada: 0, saida: 0 }
  let rodadasTool = 0
  let voltas = 0
  let encerrou = false

  for (;;) {
    // Sem ferramentas na volta final: ou estourou as rodadas, ou uma
    // ferramenta encerrou a conversa (transferiu) e so falta a despedida.
    const soTexto = encerrou || rodadasTool >= maxRodadas
    const resp = await chamarModelo(p, mensagens, soTexto ? [] : p.tools, prazo)
    voltas++
    uso.entrada += resp.uso.entrada
    uso.saida += resp.uso.saida

    if (soTexto || resp.chamadas.length === 0 || p.tools.length === 0) {
      return { texto: resp.texto.trim(), chamadas, uso, voltas, encerrou }
    }

    rodadasTool++
    mensagens.push({
      role: 'assistant',
      content: resp.texto || null,
      tool_calls: resp.chamadas.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.nome, arguments: c.argsBrutos || '{}' },
      })),
    })

    // Toda chamada precisa de resposta (a OpenAI exige), na ordem.
    for (const c of resp.chamadas) {
      const t0 = Date.now()
      let r: ResultadoFerramenta
      try {
        r = await p.executar(c)
      } catch (err) {
        // Log so com o nome da ferramenta: os args podem ter dado do cliente.
        console.error(`[maestro/llm] ferramenta ${c.nome} lancou erro:`, (err as Error)?.message)
        r = {
          ok: false,
          texto: 'Não consegui executar essa ferramenta agora. Peça desculpas e ofereça transferir para um atendente. Não diga que a ação foi feita.',
        }
      }
      const texto = r.texto.slice(0, LIMITE_RESULTADO_TOOL)
      chamadas.push({
        nome: c.nome,
        args: argsComoObjeto(c.argsBrutos),
        ok: r.ok,
        resultado: texto,
        ms: Date.now() - t0,
        simulada: r.simulada === true,
      })
      mensagens.push({ role: 'tool', content: texto, tool_call_id: c.id })
      if (r.encerra) encerrou = true
    }
  }
}

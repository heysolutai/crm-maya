import { DEFAULT_BEHAVIOR_SETTINGS, getModelByValue } from '@/lib/aiConfig'
import { consolidatePrompt } from '@/lib/promptConsolidation'

/**
 * Config do Maestro = o que o AiAgent ja tem. Nao existe config separada:
 *   - prompt     -> AiAgent.prompts.prompt_completo (consolidatePrompt)
 *   - modelo etc -> AiAgent.behaviorSettings (ver src/lib/aiConfig.ts)
 *   - chave      -> AiAgent.apiKeys.openai (senao a padrao do sistema)
 */

export const MENSAGEM_ERRO_PADRAO = 'Vou chamar um atendente para te ajudar, só um instante.'

export interface ConfigMaestro {
  modelo: string
  /** null = nao enviar (modelos de raciocinio so aceitam o padrao). */
  temperatura: number | null
  usarEmojis: boolean
  formalidade: 'formal' | 'casual' | 'neutral'
  /** Quanto tempo o "digitando..." fica no ar enquanto a IA prepara a resposta. 0 = desligado. */
  digitandoMs: number
  /** Mensagem ao cliente quando a IA falha e a conversa vai pra um atendente. */
  mensagemErro: string
  promptBase: string
}

export function comoRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/**
 * Modelo de raciocinio (o-series, gpt-5): a API recusa `temperature` diferente
 * do padrao. Mandar o parametro derrubaria o turno inteiro com HTTP 400.
 */
export function modeloAceitaTemperatura(modelo: string): boolean {
  return !/^(o\d|gpt-5)/i.test(modelo)
}

/**
 * So OpenAI por enquanto: um modelo da lista que seja de outro provedor
 * (Gemini, Claude) cai no modelo padrao em vez de falhar na OpenAI. Nome fora
 * da lista passa como esta (pode ser um modelo novo da OpenAI).
 */
export function resolverModelo(preferido: unknown): string {
  const nome = typeof preferido === 'string' ? preferido.trim() : ''
  if (!nome) return DEFAULT_BEHAVIOR_SETTINGS.preferred_model
  const conhecido = getModelByValue(nome)
  if (conhecido && conhecido.provider !== 'openai') return DEFAULT_BEHAVIOR_SETTINGS.preferred_model
  return nome
}

function numeroEntre(v: unknown, min: number, max: number, padrao: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  if (!Number.isFinite(n)) return padrao
  return Math.min(max, Math.max(min, n))
}

export function lerConfigMaestro(agente: { prompts: unknown; behaviorSettings: unknown }): ConfigMaestro {
  const b = comoRecord(agente.behaviorSettings)
  const modelo = resolverModelo(b.preferred_model)
  const formalidade = b.formality_level === 'formal' || b.formality_level === 'neutral' ? b.formality_level : 'casual'
  const erro = typeof b.error_message === 'string' ? b.error_message.trim() : ''
  return {
    modelo,
    temperatura: modeloAceitaTemperatura(modelo)
      ? numeroEntre(b.temperature, 0, 1, DEFAULT_BEHAVIOR_SETTINGS.temperature)
      : null,
    usarEmojis: typeof b.use_emojis === 'boolean' ? b.use_emojis : DEFAULT_BEHAVIOR_SETTINGS.use_emojis,
    formalidade,
    digitandoMs: numeroEntre(b.typing_indicator_delay_ms, 0, 30_000, DEFAULT_BEHAVIOR_SETTINGS.typing_indicator_delay_ms),
    mensagemErro: (erro || MENSAGEM_ERRO_PADRAO).slice(0, 500),
    promptBase: consolidatePrompt(comoRecord(agente.prompts)),
  }
}

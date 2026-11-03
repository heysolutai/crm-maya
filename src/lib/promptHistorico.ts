import { createHash } from 'node:crypto'
import { consolidatePrompt } from '@/lib/promptConsolidation'

/**
 * Historico do prompt do agente: as versoes anteriores ficam no proprio
 * AiAgent.prompts (chave `historico`), da mais recente pra mais antiga.
 *
 * Serve pra desfazer uma alteracao e pra saber qual prompt valia quando uma
 * conversa aconteceu (auditoria pelo MCP): o texto atual vale desde
 * `historico[0].trocadoEm`; `historico[i].prompt` valia de
 * `historico[i + 1].trocadoEm` ate `historico[i].trocadoEm`.
 *
 * O GET de /api/ai-configurations nao devolve esta chave (normalizePrompts),
 * entao ela nao pesa no n8n nem na tela.
 */

export const MAX_VERSOES = 10

export type OrigemPrompt = 'tela' | 'api' | 'mcp'

export interface VersaoPrompt {
  /** Texto que valia ate `trocadoEm`. */
  prompt: string
  /** Quando este texto deixou de valer (ISO). */
  trocadoEm: string
  /** Por onde veio a troca. */
  origem: OrigemPrompt
  motivo?: string
}

const ORIGENS = new Set<string>(['tela', 'api', 'mcp'])

function comoRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

export function lerHistorico(prompts: unknown): VersaoPrompt[] {
  const bruto = comoRecord(prompts).historico
  if (!Array.isArray(bruto)) return []
  const out: VersaoPrompt[] = []
  for (const item of bruto) {
    const v = comoRecord(item)
    if (typeof v.prompt !== 'string' || typeof v.trocadoEm !== 'string') continue
    out.push({
      prompt: v.prompt,
      trocadoEm: v.trocadoEm,
      origem: typeof v.origem === 'string' && ORIGENS.has(v.origem) ? (v.origem as OrigemPrompt) : 'api',
      ...(typeof v.motivo === 'string' && v.motivo ? { motivo: v.motivo } : {}),
    })
  }
  return out
}

/**
 * Historico depois de trocar o prompt de `atuais` por `novo`: o texto que
 * valia entra na frente. Mesmo texto (o modo simples salva tudo de novo) nao
 * vira versao.
 */
export function historicoComTroca(
  atuais: unknown,
  novo: string,
  origem: OrigemPrompt,
  motivo?: string,
  agora: Date = new Date()
): VersaoPrompt[] {
  const historico = lerHistorico(atuais)
  const anterior = consolidatePrompt(comoRecord(atuais))
  if (!anterior || anterior.trim() === novo.trim()) return historico
  const versao: VersaoPrompt = {
    prompt: anterior,
    trocadoEm: agora.toISOString(),
    origem,
    ...(motivo ? { motivo } : {}),
  }
  return [versao, ...historico].slice(0, MAX_VERSOES)
}

/**
 * Marca do texto atual: quem altera manda a marca que leu, e se o prompt
 * mudou nesse meio tempo a alteracao e recusada em vez de sobrescrever.
 */
export function marcaDoPrompt(texto: string): string {
  return createHash('sha256').update(texto).digest('hex').slice(0, 12)
}

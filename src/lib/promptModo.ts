import { buildPromptCompleto, normalizeSimpleForm } from './agentSimpleConfig'
import { consolidatePrompt } from './promptConsolidation'

/**
 * Qual modo esta em uso no prompt do agente (a "bolinha verde" da aba Prompt):
 *   - simples:  o texto atual e exatamente o que o formulario gravado gera;
 *   - avancado: ha texto, mas escrito a mao (prompt avancado, suporte, MCP);
 *   - nenhum:   nada salvo (a IA usa o texto padrao curto do sistema).
 *
 * O modo e escolhido SO na plataforma. O MCP le daqui e so altera no formato
 * em uso; uma alteracao que trocaria o modo e recusada.
 */
export type ModoPrompt = 'simples' | 'avancado' | 'nenhum'

function comoRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/** Mesma comparacao da tela: ignora \r\n e espacos nas pontas. */
function limpar(texto: string): string {
  return texto.replace(/\r\n/g, '\n').trim()
}

/** O texto e exatamente o que o formulario do modo simples (gravado em `prompts.simple`) gera? */
export function geradoPeloModoSimples(prompts: unknown, texto: string): boolean {
  const simple = comoRecord(prompts).simple
  if (!simple || typeof simple !== 'object') return false
  return limpar(buildPromptCompleto(normalizeSimpleForm(simple))) === limpar(texto)
}

export function modoDoPrompt(prompts: unknown): ModoPrompt {
  const p = comoRecord(prompts)
  const atual = consolidatePrompt(p)
  if (!limpar(atual)) return 'nenhum'
  return geradoPeloModoSimples(p, atual) ? 'simples' : 'avancado'
}

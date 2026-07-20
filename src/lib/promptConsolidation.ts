/**
 * Consolidacao do prompt da IA num campo unico (`prompt_completo`).
 *
 * O campo `prompts` (JSON) do AiAgent acumulou 3 esquemas ao longo do tempo:
 *  - novo   : prompt_completo (campo unico)
 *  - n8n    : papel / objetivo / funcao / funil / regras / regras_horarios / boas_vindas
 *             (gravado por /api/ai/update-prompts)
 *  - legado : persona / behavior / attendance_funnel / scheduling_funnel / business_rules
 *
 * Este helper e a fonte da verdade pra transformar qualquer um deles no texto
 * unico. Usado no GET de /api/ai-configurations (pra o front sempre receber o
 * prompt certo) e no editor.
 */

type PromptParts = Record<string, unknown>

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

const SECTIONS: Array<{ key: string; title: string }> = [
  // esquema n8n
  { key: 'papel', title: 'PAPEL' },
  { key: 'objetivo', title: 'OBJETIVO' },
  { key: 'funcao', title: 'FUNÇÃO' },
  { key: 'funil', title: 'FUNIL' },
  { key: 'regras', title: 'REGRAS' },
  { key: 'regras_horarios', title: 'REGRAS DE HORÁRIOS' },
  { key: 'boas_vindas', title: 'MENSAGEM DE BOAS-VINDAS' },
  // esquema legado do editor
  { key: 'persona', title: 'PERSONA' },
  { key: 'behavior', title: 'COMPORTAMENTO' },
  { key: 'attendance_funnel', title: 'FUNIL DE ATENDIMENTO' },
  { key: 'scheduling_funnel', title: 'FUNIL DE AGENDAMENTO' },
  { key: 'business_rules', title: 'REGRAS DE NEGÓCIO' },
]

/**
 * Devolve o prompt unico. Se `prompt_completo` ja existe, e a fonte da verdade.
 * Senao, monta a partir dos campos avulsos (n8n ou legado).
 */
export function consolidatePrompt(prompts: PromptParts | null | undefined): string {
  const p = prompts || {}

  const completo = text(p.prompt_completo)
  if (completo) return completo

  const sections = SECTIONS.map(({ key, title }) => {
    const value = text(p[key])
    return value ? `## ${title}\n${value}` : ''
  }).filter(Boolean)

  return sections.join('\n\n')
}

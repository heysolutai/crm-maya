/**
 * Catalogo de etiquetas sugeridas da conversa, com a cor de cada uma.
 *
 * Fonte unica pro gerenciador de etiquetas e pro painel de informacoes:
 * a etiqueta precisa ter a mesma cor nos dois lugares. Etiqueta criada a mao
 * (fora do catalogo) cai na cor neutra.
 */
export const TAG_CATALOG: { name: string; color: string }[] = [
  { name: 'Interessado', color: '#22c55e' },
  { name: 'Aguardando Resposta', color: '#eab308' },
  { name: 'Orçamento Enviado', color: '#3b82f6' },
  { name: 'Follow-up', color: '#a855f7' },
  { name: 'Urgente', color: '#ef4444' },
  { name: 'Qualificado', color: '#6b7280' },
  { name: 'Negociação', color: '#f97316' },
];

export const TAG_FALLBACK_COLOR = '#6b7280';

const porNome = new Map(TAG_CATALOG.map((t) => [t.name.toLowerCase(), t.color]));

export function tagColor(nome: string): string {
  return porNome.get(nome.trim().toLowerCase()) ?? TAG_FALLBACK_COLOR;
}

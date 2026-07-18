/**
 * Nome da base de conhecimento da empresa: `know_<slug>`.
 *
 * Esse identificador e usado em TRES lugares e precisa ser sempre igual:
 *  1. payload do webhook do n8n (`knowledge_name`)
 *  2. campo `knowledge` do AiAgent
 *  3. nome da TABELA no Postgres vetorial
 *
 * Por isso a logica mora aqui e nao duplicada em cada rota — se os nomes
 * divergirem, o n8n consulta uma tabela e o CRM grava em outra.
 */
import { prisma } from '@/lib/db'

// Marcas de acento (combining diacritics) removidas apos o normalize('NFD').
// Usamos o construtor RegExp com escape explicito em vez de literal pra que a
// codificacao do arquivo nunca altere esse range — se ele mudar, o slug muda
// junto e o nome deixa de bater com o que o n8n conhece.
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')

/** lowercase, sem acento, so [a-z0-9]. Mesma regra historica do projeto. */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/[^a-z0-9]/g, '')
}

export function buildKnowledgeName(companyName: string): string {
  return 'know_' + normalizeCompanyName(companyName)
}

/** Aceita apenas `know_` + letras/numeros — formato gerado por buildKnowledgeName. */
const KNOWLEDGE_NAME_REGEX = /^know_[a-z0-9]+$/

/**
 * Valida o nome antes de usar como identificador SQL.
 *
 * SEGURANCA: nome de tabela NAO pode ser parametrizado ($1) no Postgres, entao
 * ele entra por interpolacao. Como o nome deriva do nome da empresa (dado do
 * usuario), validamos o formato final aqui. Qualquer coisa fora de
 * `know_[a-z0-9]+` e rejeitada — inclusive slug vazio (empresa so com simbolos).
 */
export function assertSafeKnowledgeName(name: string): string {
  if (!KNOWLEDGE_NAME_REGEX.test(name)) {
    throw new Error('knowledge_name invalido')
  }
  return name
}

/**
 * Resolve o knowledge_name de uma empresa.
 *
 * Prioriza o valor ja gravado no AiAgent: e o nome que o n8n conhece. Se a
 * empresa for renomeada depois do sync, recalcular geraria um nome novo e os
 * vetores antigos ficariam orfaos numa tabela que ninguem consulta.
 */
export async function getKnowledgeName(companyId: string): Promise<string | null> {
  try {
    const agent = await prisma.aiAgent.findFirst({
      where: { companyId, knowledge: { not: null } },
      select: { knowledge: true },
      orderBy: { createdAt: 'desc' },
    })
    const stored = agent?.knowledge?.trim()
    if (stored && KNOWLEDGE_NAME_REGEX.test(stored)) return stored

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    })
    if (!company?.name) return null

    const built = buildKnowledgeName(company.name)
    return KNOWLEDGE_NAME_REGEX.test(built) ? built : null
  } catch (err) {
    console.error('[KnowledgeName] Falha ao resolver:', (err as Error).message)
    return null
  }
}

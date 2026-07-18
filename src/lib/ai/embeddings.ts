/**
 * Geracao de embeddings via OpenAI, usada pela base vetorial do FAQ.
 *
 * Modelo: text-embedding-3-small (1536 dimensoes) — mais barato e mais preciso
 * que o ada-002, com a MESMA dimensao. Se um dia trocar de modelo, os vetores
 * existentes precisam ser regerados: nao se pode misturar modelos diferentes
 * no mesmo indice, senao a busca por similaridade fica sem sentido.
 */
import { prisma } from '@/lib/db'
import { getSystemSettingFresh } from '@/lib/system-settings'
import { EMBEDDING_DIMENSIONS } from '@/lib/vector-db'

export const EMBEDDING_MODEL = 'text-embedding-3-small'

/**
 * Resolve a chave da OpenAI: prioridade para a chave da empresa (aiAgent),
 * com fallback para a global. Mesma logica do worker de transcricao.
 */
export async function resolveOpenAiKey(companyId: string): Promise<string | null> {
  let companyKey: string | null = null
  try {
    const aiConfig = await prisma.aiAgent.findFirst({
      where: { companyId },
      select: { apiKeys: true },
      orderBy: { createdAt: 'desc' },
    })
    const candidate = (aiConfig?.apiKeys as Record<string, unknown> | null)?.openai
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      companyKey = candidate.trim()
    }
  } catch (err) {
    console.warn('[Embeddings] Falha ao buscar aiAgent da company; usando fallback', err)
  }

  // getSystemSettingFresh devolve `undefined` quando nao encontra; normalizamos
  // pra `null` porque o contrato desta funcao e `string | null`.
  return companyKey || (await getSystemSettingFresh('default_openai_api_key')) || null
}

/**
 * Gera o embedding de um texto. Retorna null se nao houver chave configurada
 * (a indexacao e opcional — o FAQ continua funcionando sem busca semantica).
 */
export async function generateEmbedding(
  text: string,
  apiKey: string
): Promise<number[] | null> {
  const input = text.trim()
  if (!input) return null

  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      // Nao logamos o corpo cru pra nao vazar dado sensivel do payload.
      console.error(`[Embeddings] OpenAI respondeu ${res.status}`)
      return null
    }

    const data = await res.json()
    const embedding = data?.data?.[0]?.embedding

    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
      console.error(
        `[Embeddings] Resposta inesperada da OpenAI (dimensao ${
          Array.isArray(embedding) ? embedding.length : 'n/a'
        })`
      )
      return null
    }

    return embedding as number[]
  } catch (err) {
    console.error('[Embeddings] Falha ao gerar embedding:', (err as Error).message)
    return null
  }
}

/**
 * Monta o texto que sera vetorizado a partir de um FAQ.
 * Pergunta + resposta juntas dao um vetor melhor do que so a pergunta, porque
 * a resposta carrega os termos que o cliente costuma usar.
 */
export function buildFaqContent(faq: {
  question: string
  answer: string | null
  keywords?: string[] | null
}): string {
  const parts = [faq.question, faq.answer || '']
  if (faq.keywords && faq.keywords.length > 0) {
    parts.push(faq.keywords.join(', '))
  }
  return parts.filter(Boolean).join('\n').trim()
}

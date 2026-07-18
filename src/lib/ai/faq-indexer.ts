/**
 * Indexacao de FAQ na base vetorial.
 *
 * Liga as pontas: pega o FAQ do banco principal, gera o embedding na OpenAI e
 * grava na tabela da empresa no Postgres vetorial.
 *
 * IMPORTANTE — nunca lanca excecao pra fora: a indexacao e um efeito colateral
 * do CRUD de FAQ. Se a OpenAI ou o banco vetorial estiverem fora do ar, o FAQ
 * ainda tem que ser salvo normalmente. As falhas ficam no log.
 */
import {
  generateEmbedding,
  resolveOpenAiKey,
  buildFaqContent,
} from '@/lib/ai/embeddings'
import { upsertFaqVector, deleteFaqVector, listIndexedFaqs } from '@/lib/vector-db'
import { getKnowledgeName } from '@/lib/ai/knowledge-name'

export interface IndexableFaq {
  id: string
  question: string
  answer: string | null
  category?: string | null
  keywords?: string[] | null
  isActive?: boolean
  /** Usado pela sincronizacao incremental pra detectar edicao. */
  updatedAt?: Date | string | null
}

/**
 * Indexa (ou reindexa) um FAQ. FAQ inativo e removido do indice, pra que a IA
 * nao responda com conteudo desativado.
 */
export async function indexFaq(
  companyId: string,
  faq: IndexableFaq
): Promise<boolean> {
  try {
    if (!process.env.VECTOR_DATABASE_URL) return false

    // Nome da tabela = knowledge_name (`know_<slug>`), o mesmo que vai no
    // webhook do n8n. Sem ele nao ha onde gravar.
    const knowledgeName = await getKnowledgeName(companyId)
    if (!knowledgeName) {
      console.warn('[FaqIndexer] knowledge_name nao resolvido — pulando indexacao')
      return false
    }

    if (faq.isActive === false) {
      await deleteFaqVector(knowledgeName, companyId, faq.id)
      return true
    }

    const content = buildFaqContent(faq)
    if (!content) return false

    const apiKey = await resolveOpenAiKey(companyId)
    if (!apiKey) {
      console.warn('[FaqIndexer] Sem chave OpenAI (empresa nem global) — pulando indexacao')
      return false
    }

    const embedding = await generateEmbedding(content, apiKey)
    if (!embedding) return false

    await upsertFaqVector({
      knowledgeName,
      companyId,
      faqId: faq.id,
      text: content,
      embedding,
      metadata: {
        question: faq.question,
        answer: faq.answer || '',
        category: faq.category || null,
        keywords: faq.keywords || [],
        // Marca de versao — a sincronizacao compara com o updatedAt do FAQ
        // pra decidir se precisa gerar embedding de novo.
        updated_at: faq.updatedAt ? new Date(faq.updatedAt).toISOString() : '',
      },
    })

    return true
  } catch (err) {
    console.error('[FaqIndexer] Falha ao indexar FAQ:', (err as Error).message)
    return false
  }
}

/** Remove um FAQ do indice vetorial. Nao lanca. */
export async function unindexFaq(
  companyId: string,
  faqId: string
): Promise<boolean> {
  try {
    if (!process.env.VECTOR_DATABASE_URL) return false
    const knowledgeName = await getKnowledgeName(companyId)
    if (!knowledgeName) return false
    await deleteFaqVector(knowledgeName, companyId, faqId)
    return true
  } catch (err) {
    console.error('[FaqIndexer] Falha ao remover FAQ do indice:', (err as Error).message)
    return false
  }
}

export interface FaqSyncResult {
  /** FAQs que ainda nao tinham vetor */
  added: number
  /** FAQs que mudaram desde a ultima indexacao */
  updated: number
  /** Ja estavam indexados e inalterados — nao gastaram embedding */
  skipped: number
  /** Vetores removidos (FAQ deletado ou desativado) */
  removed: number
  failed: number
}

/**
 * Sincronizacao INCREMENTAL da base vetorial de uma empresa.
 *
 * So gera embedding do que mudou:
 *  - FAQ sem vetor          -> indexa (added)
 *  - FAQ com updatedAt novo -> reindexa (updated)
 *  - FAQ igual              -> pula (skipped, nao paga OpenAI)
 *  - Vetor orfao            -> remove (FAQ deletado ou desativado)
 *
 * Sem isso, cada clique em "Sincronizar" re-embeddaria a base inteira e
 * pagaria OpenAI de novo por conteudo que nao mudou.
 */
export async function syncCompanyFaqs(
  companyId: string,
  faqs: IndexableFaq[]
): Promise<FaqSyncResult> {
  const result: FaqSyncResult = { added: 0, updated: 0, skipped: 0, removed: 0, failed: 0 }

  if (!process.env.VECTOR_DATABASE_URL) return result

  const knowledgeName = await getKnowledgeName(companyId)
  if (!knowledgeName) {
    console.warn('[FaqIndexer] knowledge_name nao resolvido — sync abortado')
    return result
  }

  const indexed = await listIndexedFaqs(knowledgeName, companyId)

  // FAQs ativos sao os que devem estar no indice.
  const activeFaqs = faqs.filter((f) => f.isActive !== false)
  const activeIds = new Set(activeFaqs.map((f) => f.id))

  for (const faq of activeFaqs) {
    const previous = indexed.get(faq.id)
    const current = faq.updatedAt ? new Date(faq.updatedAt).toISOString() : ''

    if (previous !== undefined && previous === current && current !== '') {
      result.skipped++
      continue
    }

    const ok = await indexFaq(companyId, faq)
    if (!ok) result.failed++
    else if (previous === undefined) result.added++
    else result.updated++
  }

  // Remove vetores de FAQs que sumiram ou foram desativados.
  for (const faqId of indexed.keys()) {
    if (!activeIds.has(faqId)) {
      const ok = await unindexFaq(companyId, faqId)
      if (ok) result.removed++
    }
  }

  return result
}

/**
 * Indexa varios FAQs em sequencia (usado na criacao em lote e no reindex).
 * Sequencial de proposito: evita estourar rate limit da OpenAI em lotes grandes.
 */
export async function indexFaqs(
  companyId: string,
  faqs: IndexableFaq[]
): Promise<{ indexed: number; failed: number }> {
  let indexed = 0
  let failed = 0
  for (const faq of faqs) {
    const ok = await indexFaq(companyId, faq)
    if (ok) indexed++
    else failed++
  }
  return { indexed, failed }
}
